# Eric Reilly Website

This repo was recovered from the deployed S3 site on 2026-03-23 from `s3://ericreilly.com-prod`.

## What is here

- `src/` contains the React source recovered from the production source maps.
- `public/` contains the static assets and SEO files used by the site.
- `recovered-build/` preserves the exact deployed build that was downloaded from S3.

## Development

1. Install dependencies with `npm install`.
2. Start the app with `npm start`.
3. Build a production bundle with `npm run build`.

## Environment

The contact form uses `REACT_APP_CONTACT_API_URL`.

- Default production endpoint: `https://k7cpfmv07e.execute-api.us-east-1.amazonaws.com/prod/contact`
- Copy `.env.example` to `.env.local` and change it if you want to point the form at a different API.
