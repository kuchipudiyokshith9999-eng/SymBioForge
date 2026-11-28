This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Prospect Map data

The **Prospects** page (`/prospects`) maps named manufacturing sites in Coimbatore, Bengaluru and
Hyderabad as potential SymbioForge customers. Sites come from OpenStreetMap (© OpenStreetMap
contributors, ODbL) and are classified and scored in `src/lib/prospects.ts`.

Refresh the snapshot (takes a few minutes; Overpass can be slow or rate-limited):

```bash
node scripts/fetch-prospects.mjs            # all three cities
node scripts/fetch-prospects.mjs bengaluru  # one city
```

This rewrites `src/data/prospects-osm.json`. To add a city, add its bounding box to
`scripts/fetch-prospects.mjs` and to `CITIES` in `src/lib/prospects.ts`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
