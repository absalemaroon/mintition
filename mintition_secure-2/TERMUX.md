# Running commands on your phone (Termux)

An `.mjs` file is a Node script. You run it with `node`, from inside the project folder.

```
pkg update -y && pkg install -y nodejs unzip
termux-setup-storage                      # tap Allow
cd ~ && unzip -o ~/storage/downloads/mintition_secure.zip -d mintition && cd mintition
```
(use the name of the zip you downloaded)

## Make the two secrets
```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # DATA_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # CRON_SECRET
```
Long-press the printed line, tap Copy, and paste it into Vercel: Project > Settings > Environment Variables.
Save both in a notes app or password manager. Losing DATA_ENCRYPTION_KEY means the encrypted wallets can never be opened.

## Optional: chain logos
`node scripts/fetch-chain-logos.mjs` (needs internet). Purely cosmetic.
