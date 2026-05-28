// api/zoho-lead.js — Vercel serverless function
// Receives gate form data, creates/updates Zoho CRM contact, adds a note.
// Called fire-and-forget from the client (keepalive:true) so checkout is never delayed.

const https = require('https');
const querystring = require('querystring');

// ── Country helpers ──────────────────────────────────────────
const COUNTRY_NAMES = {
  IE:'Ireland', GB:'United Kingdom', DE:'Germany', FR:'France',
  BE:'Belgium', AT:'Austria', CH:'Switzerland', ES:'Spain',
  IT:'Italy', PT:'Portugal', SE:'Sweden', NO:'Norway',
  DK:'Denmark', FI:'Finland', PL:'Poland', CZ:'Czech Republic',
  NL:'Netherlands', AU:'Australia', CA:'Canada', US:'United States',
};

const DIAL_CODES = {
  IE:'+353', GB:'+44', DE:'+49', FR:'+33', BE:'+32', AT:'+43',
  CH:'+41', ES:'+34', IT:'+39', PT:'+351', SE:'+46', NO:'+47',
  DK:'+45', FI:'+358', PL:'+48', CZ:'+420', NL:'+31',
  AU:'+61', CA:'+1', US:'+1',
};

// ── Gender inference from first name ────────────────────────
function inferGender(firstName) {
  const n = (firstName || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const M = new Set([
    'liam','noah','oliver','james','william','ben','benjamin','lucas','henry','alexander',
    'mason','ethan','daniel','jacob','logan','jackson','jack','aiden','owen','samuel',
    'ryan','nathan','adam','ian','sean','patrick','michael','thomas','peter','david',
    'mark','paul','kevin','brian','stephen','robert','andrew','christopher','matthew',
    'joseph','charles','george','edward','richard','john','conor','ciaran','declan',
    'eoin','fionn','gavin','niall','cormac','darragh','killian','oisin','ronan','shane',
    'tadhg','alan','barry','donal','fergus','gerard','hugh','karl','luke','aaron','alex',
    'callum','charlie','cole','dylan','eli','felix','finn','gabriel','harvey','isaac',
    'jake','jason','jay','joe','josh','kyle','leo','leon','luca','max','mike','nick',
    'noel','oscar','rhys','rob','scott','simon','tom','victor','will','zach','andre',
    'christoph','hans','jan','johannes','kai','lars','markus','nicolas','stefan','tobias',
    'franz','joachim','jochen','jorg','jurgen','lutz','manfred','rainer','rolf','ulrich',
    'volker','werner','wolfgang','claude','denis','fabrice','francois','guillaume','jean',
    'julien','laurent','luc','marc','maxime','pascal','pierre','sylvain','thierry','vincent',
    'yann','marco','matteo','roberto','giuseppe','giovanni','antonio','franco','luigi',
    'mario','davide','emanuele','fabio','giacomo','paolo','stefano','diego','carlos',
    'jorge','jose','juan','luis','manuel','miguel','pablo','pedro','rafael','santiago',
    'sergio','alejandro','emilio','felipe','fernando','javier','ricardo','rodrigo','ruben',
    'tomasz','piotr','krzysztof','marek','michal','pawel','wojciech','grzegorz','andrzej',
    'jamie','kieran','colm','cillian','seamus','padraig','brendan','dermot','fintan',
    'enda','noel','gearoid','cian','daithí','odhrán','cathal','ferdia','lorcan',
  ]);
  const F = new Set([
    'olivia','emma','ava','sophia','isabella','mia','charlotte','amelia','harper',
    'evelyn','abigail','emily','elizabeth','sofia','ella','madison','scarlett','victoria',
    'grace','chloe','penelope','riley','zoey','nora','lily','eleanor','hannah','lillian',
    'addison','aubrey','natalie','brooklyn','savannah','avery','leah','anna','claire',
    'ellie','samantha','audrey','arianna','sarah','alice','caroline','lucy','bella',
    'katherine','eva','aria','julia','stella','aurora','piper','maya','gabrielle','naomi',
    'hailey','eliana','layla','zoe','violet','sophie','alexis','jasmine','ashley',
    'jessica','taylor','morgan','amelie','camille','helene','juliette','laure','lea',
    'lucie','marie','marine','melanie','pauline','valentina','valeria','patricia','linda',
    'mary','barbara','dorothy','lisa','nancy','margaret','betty','ruth','sandra','frances',
    'carol','diane','kathleen','donna','virginia','judith','janet','debra','shirley',
    'catherine','cynthia','angela','cheryl','amy','denise','teresa','irene','maureen',
    'brigid','aoife','sinead','niamh','siobhan','caoimhe','mairead','aisling','deirdre',
    'fiona','maeve','orla','roisin','una','clodagh','sorcha','grainne','saoirse','caoimhe',
    'greta','ingrid','karen','katrin','kristin','lena','marta','monika','natalia','nina',
    'olga','petra','sonja','susanne','birgit','brigitte','dagmar','elke','hannelore',
    'hildegard','ines','johanna','karin','margit','renate','sabine','sigrid','silke',
    'ursula','anne','beatrice','celeste','christelle','corinne','dominique','estelle',
    'frederique','genevieve','isabelle','jacqueline','josephine','laurence','marielle',
    'nathalie','sandrine','veronique','viviane','beatriz','carmen','cristina','elena',
    'esperanza','isabel','lucia','mercedes','paloma','pilar','rosa','teresa',
    'agnieszka','dorota','ewa','joanna','katarzyna','magdalena','malgorzata',
    'laura','kate','rachel','jennifer','jennifer','claire','rachel','helen',
  ]);
  if (M.has(n)) return 'Male';
  if (F.has(n)) return 'Female';
  return null; // unknown — don't set -None- in Zoho
}

// ── Zoho OAuth token ─────────────────────────────────────────
async function getZohoToken() {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify({
      grant_type:    'refresh_token',
      client_id:     process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    });
    const domain = process.env.ZOHO_ACCOUNTS_DOMAIN || 'accounts.zoho.eu';
    const opts = {
      hostname: domain,
      path: '/oauth/v2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          if (p.access_token) resolve(p.access_token);
          else reject(new Error('Token error: ' + data));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Generic Zoho API request ─────────────────────────────────
async function zohoReq(method, path, token, body = null) {
  return new Promise((resolve, reject) => {
    const apiDomain = process.env.ZOHO_API_DOMAIN || 'www.zohoapis.eu';
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: apiDomain,
      path,
      method,
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({ _raw: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Phone country-code formatter ─────────────────────────────
function formatPhone(phone, dialCode) {
  if (!phone || !dialCode) return phone;
  const p = phone.trim();
  if (p.startsWith('+')) return p; // already has code
  if (p.startsWith('00')) return '+' + p.slice(2); // 00XX → +XX
  return dialCode + p.replace(/^0/, ''); // strip leading 0, prepend +XX
}

// ── Handler ──────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const { name = '', email = '', yob, country = '', bottle = '', gift = '' } = req.body || {};

    // Split full name → first / last
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '';
    const lastName  = parts.length > 1 ? parts.slice(-1)[0] : '';

    const gender      = inferGender(firstName);
    const countryName = COUNTRY_NAMES[country] || country;
    const dialCode    = DIAL_CODES[country] || '';

    const token = await getZohoToken();

    // Search for existing contact
    const searchPath = `/crm/v3/Contacts/search?criteria=(Email:equals:${encodeURIComponent(email)})&fields=id,Email,Phone,First_Name,Last_Name`;
    const searchRes  = await zohoReq('GET', searchPath, token);
    const existing   = (searchRes?.data || [])[0];

    // Build contact payload
    const payload = {
      First_Name:      firstName,
      Last_Name:       lastName || firstName, // Zoho requires Last_Name
      Email:           email,
      YEAR_OF_BIRTH:   String(yob || ''),
      Y_O_B_Confirmed: true,
      Mailing_Country: countryName,
      Lead_Source:     'Web Form',
      Source:          'Free Gift + 20% Off Page',
      ...(gender ? { GENDER: gender } : {}),
    };

    // If contact already has a phone, reformat with country code
    if (existing?.Phone) {
      const formatted = formatPhone(existing.Phone, dialCode);
      if (formatted !== existing.Phone) payload.Phone = formatted;
    }

    let contactId;

    if (existing) {
      contactId = existing.id;
      await zohoReq('PUT', `/crm/v3/Contacts/${contactId}`, token, {
        data: [{ id: contactId, ...payload }],
      });
    } else {
      const createRes = await zohoReq('POST', '/crm/v3/Contacts', token, { data: [payload] });
      contactId = createRes?.data?.[0]?.details?.id;
    }

    // Add a note with full lead context
    if (contactId) {
      const noteLines = [
        `🎁 Lead completed the Irish Premium Spirits free gift + 20% off offer form.`,
        ``,
        `Selected Bottle : ${bottle || '—'}`,
        `Selected Gift   : ${gift || '—'}`,
        `Country         : ${countryName}${dialCode ? ' (' + dialCode + ')' : ''}`,
        `Year of Birth   : ${yob || '—'}`,
        `Gender (inferred): ${gender || 'Could not determine'}`,
        `Source          : Free Gift + 20% Off Page (offers.irishpremiumspirits.eu)`,
        ``,
        `⚠️  If no matching order exists, the customer may have abandoned checkout.`,
        `    Consider sending a follow-up email to recover the sale.`,
      ];
      await zohoReq('POST', '/crm/v3/Notes', token, {
        data: [{
          Note_Title:   '🎁 Offer Page Lead — Free Gift + 20% Off',
          Note_Content: noteLines.join('\n'),
          Parent_Id:    { id: contactId, module: 'Contacts' },
        }],
      });
    }

    res.status(200).json({ ok: true, contactId, created: !existing });

  } catch (err) {
    console.error('[zoho-lead]', err.message);
    // Always 200 — client ignores response anyway, never block checkout
    res.status(200).json({ ok: false, error: err.message });
  }
};
