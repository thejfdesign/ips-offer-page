# Irish Premium Spirits — Free Gift Page Setup

---

## ① Create the Shopify Discount Code

1. **Shopify Admin → Discounts → Create discount → Amount off products**
2. Settings:
   - Method: **Discount code**
   - Code: `FREEGIFT` (or your choice — must match `CFG.discountCode` in the script)
   - Value: **100% off**
   - Applies to: **Specific collections → Clothing & Accessories**
   - Minimum purchase requirement: **€21.99** (prevents code abuse without a bottle)
   - Customer eligibility: All customers
   - Usage limits: ✅ **Limit to one use per customer**
3. Save and activate

---

## ② Wire the Zoho Flow Webhook

### Create the Zoho Flow
1. Go to **Zoho Flow → Create Flow**
2. Trigger: **Webhook** → copy the webhook URL it generates
3. Add an action: **Zoho CRM → Create Record → Leads**
4. Map the incoming JSON fields to CRM lead fields:

   | Webhook field       | CRM Lead field        |
   |---------------------|-----------------------|
   | `email`             | Email                 |
   | `year_of_birth`     | DOB Year (custom field or Description) |
   | `lead_source`       | Lead Source           |
   | `bottle_chosen`     | Description (append)  |
   | `gift_chosen`       | Description (append)  |
   | `status`            | Lead Status           |
   | `timestamp`         | Created Time          |

5. **Set Lead Type to B2C** and Lead Source to "Web" or "Promotion"
6. Activate the flow

### Add the webhook URL to the page
Open `index.html` and find the `CFG` block near the top of the script:

```js
const CFG = {
  store:        'https://irishpremiumspirits.eu',
  discountCode: 'FREEGIFT',
  zohoWebhook:  'https://flow.zoho.eu/YOUR_WEBHOOK_URL', // ← paste your URL here
  zohoEnabled:  false,  // ← change to true once URL is set
};
```

Replace the `zohoWebhook` URL and set `zohoEnabled: true`.

### When data hits Zoho
The webhook fires **twice**:
1. **On form submit** — captures email + year of birth immediately (before they even scratch the card). This is your abandonment safety net.
2. **On claim (checkout redirect)** — updates the lead with the bottle and gift they chose + status "Proceeded to checkout"

---

## ③ How the Shopify data pre-fill works

When the customer clicks "Add to Cart & Claim Free Gift", they land in Shopify cart at:

```
https://irishpremiumspirits.eu/cart/BOTTLE_VARIANT:1,GIFT_VARIANT:1
  ?discount=FREEGIFT
  &attributes[Lead Email]=their@email.com
  &attributes[Year of Birth]=1985
  &attributes[Source]=Free Gift Landing Page
  &note=Promo lead | Email: their@email.com | YOB: 1985
```

- The discount code makes the clothing item **€0.00** at checkout
- The `note` and `attributes` appear in the Shopify **order details** — useful for fulfilment
- The email does **not** pre-fill the Shopify checkout email box (Shopify doesn't allow this via URL — would need Storefront API or a Shopify app for that)

---

## ④ Updating stock / products

### Add a new bottle
In the `BOTTLES` array in the script:
```js
{
  id:    SHOPIFY_VARIANT_ID,
  title: 'Product Name',
  type:  'Irish Whiskey',      // shown as card badge
  cat:   'whiskey',            // whiskey | rum | gin | vodka | liqueur
  abv:   '43%',
  size:  '700mL',
  price: 49.99,
  img:   'https://cdn.shopify.com/...',
},
```

### Add/update a free gift item
In the `GIFTS` array:
```js
{
  key:   'unique-key',
  title: 'Product Name',
  price: 19.99,
  img:   'https://cdn.shopify.com/...',
  variants: [
    { id: VARIANT_ID, size: 'Large' },
    { id: VARIANT_ID, size: 'X-Large' },
  ],
},
```

### Find variant IDs
Visit: `https://irishpremiumspirits.eu/products.json?limit=250`

---

## ⑤ Hosting options

This is a **single static HTML file** — drop it anywhere.

| Option | How |
|--------|-----|
| Shopify page | Admin → Pages → Add page → Paste HTML via `</>` editor. Use full-width template. |
| 20i hosting | Upload `index.html` to a folder e.g. `/offer/` |
| Netlify | Drag the file onto netlify.com/drop — live in seconds |
| Cloudflare Pages | Connect repo or drag-and-drop |

**Recommended URL**: `irishpremiumspirits.eu/offer` or `irishpremiumspirits.eu/free-gift`

---

## ⑥ Dev preview (local)

```bash
cd "/Users/jfdesign/ELEMENTOR TEMPLATES/Irish Premium Spirits"
python3 -m http.server 5057
# open http://localhost:5057
```

---

## ⑦ Offer 2 — Free 50cl Bottle (`/offer2`)

A second offer page lives at **`offers.irishpremiumspirits.eu/offer2`** (folder `offer2/index.html`).

**Mechanic:** Buy any 70cl bottle at full price → choose a FREE 50cl bottle (Honey or Classic).

**⚠️ REQUIRED — create the Shopify discount code `FREE50`:**
1. Shopify Admin → Discounts → Create discount → **Amount off products**
2. Method: **Discount code**, Code: `FREE50`
3. Value: **100% off**
4. Applies to: **Specific products** → the two 50cl bottles:
   - The Wild Geese® Irish Honey Liqueur — **500mL** variant
   - The Wild Geese® Irish Whiskey Classic Blend — **500mL** variant
5. Minimum requirement: **2 items** (or min €21.99) so it can't be used without a 70cl bottle
6. Limit: **one use per customer**, **one use total per order**

The page applies `?discount=FREE50` automatically at checkout. If you use a different
code name, change `CFG.discountCode` near the top of `offer2/index.html`.

**Note:** the 50cl Honey/Classic stock is low (≈5 and ≈4 units) — the page auto-hides
either option if it sells out.

---

## ⑧ Offer 3 — Free Shipping (`/offer3`)

A third offer page lives at **`offers.irishpremiumspirits.eu/offer3`** (folder `offer3/index.html`).

**Mechanic:** Buy **3 of the SAME bottle** → **10% off + FREE shipping**. Single stage — pick a
bottle (adds qty 3 to cart) → see the saving → straight to checkout. No lead form.

**⚠️ REQUIRED — create TWO combinable Shopify codes:**

`SAVE10` — 10% off the bottles:
1. Discounts → Create → **Amount off products** → Code `SAVE10`
2. Value: **10% off**, applies to All products (or the 70cl spirits)
3. Minimum quantity: **3 items**
4. Under **Combinations**, tick **"Shipping discounts"** so it stacks with free shipping

`FREESHIP` — free shipping:
1. Discounts → Create → **Free shipping** → Code `FREESHIP`
2. Minimum quantity: **3 items**; countries: the regions you ship to
3. Under **Combinations**, tick **"Product discounts"** so it stacks with SAVE10

The page adds 3 of the chosen bottle and applies `?discount=SAVE10,FREESHIP` (both codes).
**Both discounts must be set to combine with each other** or only one will apply.
Shows all in-stock 70cl bottles. Shipping saving shown is capped at €22.99.
Edit `CFG.qty` / `CFG.discountPct` / `CFG.discountCode` near the top of `offer3/index.html`
to change quantity, % off, or the code names.
