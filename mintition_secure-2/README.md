# Mintition

Mintition is a web application for preparing, funding, and managing batches of blockchain wallets used to mint digital credentials on the Celo network. The application combines a Next.js App Router frontend, Supabase authentication and persistence, ethers.js wallet and transaction tooling, and a dashboard-oriented workflow for generating wallets, funding them with CELO, minting credentials, reviewing transaction progress, and saving reusable wallet batches.

This document is the primary technical and operational guide for the repository. It explains the product purpose, architecture, local development workflow, environment configuration, authentication model, wallet lifecycle, funding process, minting process, batch persistence, security considerations, deployment, troubleshooting, testing expectations, and future improvement areas.

> Important security notice: this application handles blockchain wallet addresses and private keys. A private key is equivalent to control of the wallet. Never paste production private keys into issues, pull requests, chat messages, screenshots, analytics events, logs, or untrusted forms. Treat generated exports and browser storage as sensitive secrets.

## Table of contents

- [Product overview](#product-overview)
- [Core capabilities](#core-capabilities)
- [Technology stack](#technology-stack)
- [Repository structure](#repository-structure)
- [Application architecture](#application-architecture)
- [User workflow](#user-workflow)
- [Authentication](#authentication)
- [Supabase configuration](#supabase-configuration)
- [Wallet generation](#wallet-generation)
- [Wallet storage and export](#wallet-storage-and-export)
- [Connecting MetaMask](#connecting-metamask)
- [Funding wallets](#funding-wallets)
- [Automated funding](#automated-funding)
- [Credential minting](#credential-minting)
- [Smart contract configuration](#smart-contract-configuration)
- [Batch persistence](#batch-persistence)
- [API routes and server actions](#api-routes-and-server-actions)
- [Environment variables](#environment-variables)
- [Local development](#local-development)
- [Production deployment](#production-deployment)
- [Database setup](#database-setup)
- [Security model](#security-model)
- [Operational safety](#operational-safety)
- [Troubleshooting](#troubleshooting)
- [Validation and quality checks](#validation-and-quality-checks)
- [Contribution workflow](#contribution-workflow)
- [Design and accessibility](#design-and-accessibility)
- [Performance considerations](#performance-considerations)
- [Known limitations](#known-limitations)
- [Recommended roadmap](#recommended-roadmap)
- [Glossary](#glossary)

## Product overview

Mintition is designed for workflows in which a user needs to operate several blockchain wallets rather than a single personal wallet. The application gives the user a dashboard where wallets can be created in a controlled batch, supplied with native-token funds for transaction fees, and used to execute credential minting operations against a configured contract.

The central concept is a **wallet batch**. A batch is a named collection of generated wallets and their current operational state. The dashboard can use a batch as the working set for funding and minting. Batch metadata can be saved through Supabase so a user can return to previously created groups instead of rebuilding them from scratch.

The application is currently optimized for the Celo mainnet. The default chain identifier is `42220`, the native funding token is CELO, and the configured credential contract is represented by the address in `lib/contract-config.ts`. The application uses the public Celo Forno RPC endpoint for read operations performed by the minting utilities.

Mintition is not a custodial wallet service. It does not remove the need for the operator to protect keys, verify destination addresses, confirm network settings, and review transactions before signing them. The interface automates repetitive steps, but the operator remains responsible for every blockchain action initiated from the browser or from an automated funding flow.

## Core capabilities

### Authentication and protected access

The root route redirects to the dashboard route. Unauthenticated users are redirected to the login page by the Supabase session proxy. Authenticated users can access the dashboard, load saved batches, and sign out from the interface.

### Wallet generation

The dashboard can generate multiple Ethereum-compatible wallets using ethers.js. Each generated wallet includes an address and private key, along with local application metadata such as funding state, mint count, balance display, and status. The default generation count is five, although the dashboard allows the operator to change the count before generating a new group.

### Wallet management

The wallet management component presents the current working set and supports operational actions such as reviewing wallet information, importing or exporting wallet data, deleting wallets, and clearing the local working set. The exact controls should be reviewed in `components/wallet-management.tsx` when extending the feature because the component is the principal UI boundary for wallet-level actions.

### MetaMask connection

The dashboard can connect to an injected browser wallet such as MetaMask. The connected wallet supplies the signer used for manual CELO funding. The connection process checks for an injected `window.ethereum` provider, requests accounts, creates an ethers `BrowserProvider`, and obtains a signer.

### Manual batch funding

The connected signer can send a configured CELO amount to each generated wallet. The dashboard checks the connected account balance before sending, executes transfers sequentially, waits for receipts, marks successful wallets as funded, and displays a summary of successful and failed transfers.

### Automated funding

The automated funding section accepts a funding wallet private key and an amount per wallet. It uses the helper in `lib/auto-funding.ts` to fund the working set and report progress. Because this mode accepts a private key, it must be treated as a privileged and high-risk operation. It should only be used in a controlled environment with a dedicated funding wallet containing the minimum required balance.

### Credential minting

The dashboard calls the configured contract's `mint(address,string)` function for each selected wallet. The minting hook waits for the transaction receipt, extracts the `CredentialMinted` event, and records the resulting transaction hash, token identifier, recipient, token URI, and status in the dashboard state.

### Batch persistence

Named batches are saved through server actions and database utilities. The SQL schema uses a `wallet_batches` table with JSONB wallet data, wallet count, funding totals, mint totals, timestamps, and an update trigger. This makes batch metadata available across sessions while the active browser wallet state remains locally managed by the storage helper.

## Technology stack

Mintition uses the following major technologies:

- **Next.js 16** with the App Router for routing, server actions, API routes, layouts, and production builds.
- **React 19** for client-side dashboard state and interactive controls.
- **TypeScript** for application code and shared domain types.
- **Supabase** for authentication, server-side session handling, and persisted wallet batch records.
- **`@supabase/ssr`** for Supabase clients that correctly participate in Next.js cookie-based sessions.
- **`@supabase/supabase-js`** for browser and administrative Supabase clients.
- **ethers.js** for wallet generation, provider access, signer access, balance reads, transaction submission, ABI encoding, receipt handling, and event parsing.
- **Celo** as the configured blockchain network and CELO as the native transaction-fee currency.
- **Tailwind CSS 4** and the existing UI component primitives for styling.
- **Radix UI** primitives behind the reusable UI components.
- **Sonner** for toast notifications.
- **Lucide React** for interface icons.
- **Vercel Analytics** for deployment analytics where enabled.

The package manager is pnpm. The repository contains a `pnpm-lock.yaml`, and deployments currently use a pnpm 10-compatible installation flow. Keep `package.json` and the lockfile synchronized whenever dependencies change.

## Repository structure

```text
app/
  actions.ts                    Server actions for wallet batch operations
  api/
    batch/[id]/route.ts         Batch-specific API route
    batch-fund/route.ts         Batch funding API route
  auth/
    layout.tsx                  Authentication page layout
    login/page.tsx              Login screen
  dashboard/page.tsx            Protected dashboard route
  globals.css                   App-level CSS entry point
  layout.tsx                    Root layout and providers
  page.tsx                      Root redirect

components/
  dashboard.tsx                 Main client-side dashboard controller
  auto-funding-section.tsx      Automated funding form and progress UI
  wallet-management.tsx         Wallet list and wallet actions
  theme-provider.tsx            Theme provider wrapper
  ui/                           Reusable Radix/Tailwind UI primitives

lib/
  auto-funding.ts               Automated CELO funding helpers
  batch-funding.ts               Batch funding utilities
  contract-config.ts            Network, contract address, and ABI
  db-utils.ts                   Supabase database helpers
  nft-utils.ts                  NFT and token URI helpers
  storage.ts                    Browser-local wallet persistence
  types.ts                      Shared wallet and transaction types
  use-web3-contract.ts           React hook for contract calls
  utils.ts                      General utility functions
  wallet-utils.ts               Wallet validation and utility functions
  supabase/
    client.ts                   Browser Supabase client
    proxy.ts                    Session refresh and route protection helpers
    server.ts                   Server Supabase client
    server-admin.ts             Service-role client for trusted server code

scripts/
  create_wallet_batches.sql      Supabase table, index, RLS, and timestamp trigger

proxy.ts                         Next.js session and route protection proxy
package.json                     Project scripts and dependencies
pnpm-lock.yaml                   Locked dependency graph
```

## Application architecture

### Route layer

The App Router separates public authentication screens from the protected dashboard. `app/page.tsx` redirects visitors to `/dashboard`, while `proxy.ts` checks the Supabase user session and redirects unauthenticated requests to `/auth/login`.

The dashboard page is a route-level entry point that renders the interactive dashboard component. The dashboard itself is a client component because it needs browser APIs, React state, MetaMask access, local storage, and user-driven transaction flows.

### Client state

The dashboard owns transient operational state, including:

- The current wallet list.
- The number of wallets to generate.
- Contract address and validity state.
- CELO amount per wallet.
- Network identifier.
- Transaction history.
- Minting and funding loading state.
- Connected MetaMask address, provider, and signer.
- Saved batch list and selected batch.
- Current user email.

This state is intentionally separated from persisted batch metadata. A future revision should consider replacing broad `any[]` batch state with a dedicated `WalletBatch` type and should make the persistence boundary explicit.

### Server boundary

Server actions in `app/actions.ts` call functions in `lib/db-utils.ts`. The actions provide a small, typed boundary for saving, listing, loading, and updating batches without exposing database connection details to the client component.

The server-side Supabase client in `lib/supabase/server.ts` uses request cookies. The administrative client in `lib/supabase/server-admin.ts` uses the service-role key and must only be imported by trusted server-side code. Never expose the service-role key to client components or public browser bundles.

### Blockchain boundary

The blockchain boundary is concentrated in the web3 hook and utility modules. `lib/use-web3-contract.ts` creates contract instances, executes mint calls, waits for receipts, reads balances, and translates transaction results into application-level records. `lib/contract-config.ts` is the source of truth for the current network and contract ABI.

## User workflow

A typical operator workflow is:

1. Open the application and sign in.
2. Connect MetaMask to the intended Celo network.
3. Generate a wallet batch.
4. Review the generated addresses and keep a secure backup of the private keys.
5. Optionally save the batch with a descriptive name.
6. Fund the wallets manually from the connected MetaMask account or use the automated funding section with a dedicated funding key.
7. Confirm that successful wallet balances are sufficient for the intended transactions.
8. Configure or verify the contract address, network identifier, and token URI inputs.
9. Start the minting flow.
10. Monitor transaction status and receipts.
11. Export or archive the resulting wallet and transaction records according to the organization's security policy.
12. Sign out when the session is no longer needed.

The operator should verify the network before every funding or minting operation. A valid-looking address on the wrong network can still result in a failed transaction, an unexpected contract call, or funds being sent somewhere the operator did not intend.

## Authentication

Mintition uses Supabase Auth. The login page provides the user-facing entry point. Once authenticated, the Supabase session is maintained through cookies and refreshed by the session proxy.

The proxy performs two related tasks:

1. It refreshes or validates the session using the Supabase server client.
2. It redirects users based on the requested route and authentication state.

When a logged-in user visits `/auth/login`, the proxy can redirect that user to `/dashboard`. When a user without a session requests a protected route, the proxy redirects to the login screen.

The dashboard reads the current authenticated user with the browser Supabase client. The email is displayed in the dashboard state when available. Logout calls `supabase.auth.signOut()`, shows a success notification, routes the user to the login page, and refreshes the router.

### Authentication recommendations

- Require email confirmation if the deployment is intended for more than a private internal team.
- Configure an explicit allowlist of redirect URLs in Supabase.
- Use strong passwords and enable multi-factor authentication where appropriate.
- Do not treat authentication as authorization for every blockchain operation. Add role checks before allowing administrative batch access or automated funding.
- Scope database queries by authenticated user as soon as multi-user persistence is introduced.

## Supabase configuration

The application expects a Supabase project with authentication enabled and a database table for wallet batches. The browser client uses the public project URL and anonymous key. Trusted server-only operations may use the service-role key through `server-admin.ts`.

The minimum conceptual configuration is:

```text
NEXT_PUBLIC_SUPABASE_URL       Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY  Public anonymous key
SUPABASE_SERVICE_ROLE_KEY      Server-only service-role key
```

The public values may be used by browser code according to Supabase's normal architecture. The service-role key must never be placed in a `NEXT_PUBLIC_` variable and must never be sent to the browser.

Database policies should be revisited before production use. The current SQL script enables RLS but creates an allow-all policy. That policy is convenient for early development but does not provide tenant isolation. A production policy should associate each batch with an authenticated user identifier and use `auth.uid()` in policy expressions.

## Wallet generation

Wallet generation is performed in the browser by calling `ethers.Wallet.createRandom()`. Each wallet receives a random private key and a corresponding address. Generated wallets are stored in React state for immediate use and passed to the storage helper for browser persistence.

The generated metadata currently includes fields such as:

- `address`: the public Ethereum-compatible wallet address.
- `privateKey`: the secret signing key.
- `funded`: whether the application believes the wallet was funded.
- `fundingStatus`: a display-oriented funding status.
- `mintsCompleted`: the number of completed mints tracked by the application.
- `status`: the current workflow state.
- `balance`: the last displayed or assigned balance value.

The wallet generator should be treated as a key-generation tool, not as a secure custody system. Browser-generated keys are only as safe as the browser environment and the storage mechanism. For high-value or production workflows, consider using hardware wallets, an HSM-backed signer, a dedicated transaction service, or a key-management provider instead of exporting raw private keys.

### Generation safeguards

Before generating or replacing a batch, the interface should make it obvious that the existing working set will be replaced. A future improvement should add a confirmation dialog when wallets already exist, enforce a maximum batch size, and show the estimated total funding requirement before generation.

## Wallet storage and export

The `lib/storage.ts` helper stores wallets in browser `localStorage` under the key `celo_wallets_v2`. Transaction records use a separate key. This makes the dashboard convenient across refreshes on the same browser profile, but it also means wallet secrets are stored in an origin-readable browser database.

The helper provides methods for:

- Reading all wallets.
- Saving a full wallet list.
- Adding one wallet.
- Updating a wallet by address.
- Deleting a wallet by address.
- Clearing the local wallet list.
- Exporting the wallet list as CSV.
- Importing wallets from CSV.

### Risks of local storage

Local storage is not encrypted by the application. Any script executing in the same origin, a browser extension with access, a compromised workstation, or a user who shares the browser profile may be able to access the keys. Do not use the current local storage implementation as a secure vault.

CSV exports are equally sensitive. They include private keys and should be encrypted at rest, transferred only through approved channels, removed after use, and excluded from source control. Never attach an export to a support ticket without removing secrets first.

### Recommended storage evolution

A safer design would store only public addresses and operational metadata in the browser, while signing is handled by an explicit wallet connection or a server-side key management system. If raw keys must be imported, use encrypted storage with a user-supplied passphrase, Web Crypto encryption, short-lived in-memory use, and explicit wipe controls. Even that approach should be reviewed by a security professional before handling meaningful funds.

## Connecting MetaMask

The `connectWallet` flow checks whether the application is running in a browser and whether `window.ethereum` exists. If no injected provider is available, the user receives a message explaining that MetaMask is required.

When a provider is available, the application requests accounts using `eth_requestAccounts`, stores the first account, creates an ethers `BrowserProvider`, and obtains a signer. The signer is then used for manual CELO transfers and any other user-approved transactions that are sent through the connected wallet.

The UI handles common MetaMask errors:

- `-32002`: another connection request is already pending.
- `4001`: the user rejected the request.
- Other errors: a generic connection failure with the provider message when available.

A production-ready implementation should also listen for `accountsChanged` and `chainChanged` events, clear stale signer state when the account changes, and block operations when the active chain is not the configured chain. It should not rely only on the text input labeled network ID; the provider's actual chain ID must be checked programmatically.

## Funding wallets

Manual funding sends native CELO from the connected signer to every wallet in the active list. The amount entered in the interface is parsed with `ethers.parseEther`, which avoids floating-point arithmetic for the transaction value.

Before sending transfers, the dashboard calculates:

```text
required balance = amount per wallet × number of wallets
```

It reads the connected account balance and stops before sending if the balance is insufficient. Transfers are then submitted one at a time. Each transaction is awaited, and a wallet is marked funded only when its receipt indicates success.

Sequential transfers are intentionally easier to reason about than a fully parallel approach. They reduce simultaneous MetaMask prompts and make it easier to associate a receipt with the correct wallet. The trade-off is that a large batch takes longer and one delayed transaction can hold up subsequent transfers.

### Funding failure behavior

If an individual transfer fails, the dashboard logs the failure and marks that wallet as funding failed while continuing with the remaining wallets. The final notification reports the number of successful transfers. Operators should inspect the transaction history and chain explorer before retrying, because a timeout does not always mean that a transaction was not mined.

### Funding safety checklist

- Confirm MetaMask is connected to Celo mainnet.
- Confirm the connected account is the intended funding account.
- Confirm the CELO amount per wallet.
- Confirm the total amount plus gas reserve.
- Confirm the generated destination addresses.
- Test with one wallet before funding a large batch.
- Wait for receipts before closing the tab.
- Keep a record of transaction hashes.

## Automated funding

The automated funding section is intended for operators who need to send CELO to many wallets without repeatedly approving each transfer through MetaMask. It accepts a private key, validates the key, and invokes the auto-funding utility.

The section updates wallet state to indicate that funding is in progress, reports progress through a callback, applies successful balance updates, and restores appropriate state if the operation fails. Toast notifications provide start, completion, and error feedback.

This is the highest-risk user flow in the application because the browser temporarily receives a private signing key. Use a dedicated funding wallet with a limited balance. Never use an account that holds long-term assets. Avoid pasting the key into a shared computer, recording the screen while entering it, or leaving the page open unattended.

A future production architecture should replace direct private-key entry with a server-side transaction service or a managed signer. If direct entry remains, the UI should include an explicit warning, disable browser autofill, avoid logging the value, clear the input after use, and ensure no error message contains the key.

## Credential minting

The minting hook calls the configured contract's `mint` function with two arguments:

```text
mint(recipientAddress, tokenUri)
```

The hook creates an ethers contract using the active signer, submits the transaction, waits for the receipt, and searches the receipt logs for the `CredentialMinted` event. When the event is found, the hook returns a structured result containing the transaction hash, token ID, recipient, token URI, and success state.

The receipt event is important because a transaction hash alone only proves that a transaction was submitted. The event provides application-level evidence that the expected contract function emitted the expected signal. Operators should still verify the transaction on a block explorer when the value or business consequence is important.

### Minting considerations

- Validate every recipient address before submitting.
- Validate or normalize token URIs before calling the contract.
- Confirm that the contract address belongs to the intended deployment.
- Confirm the signer is connected to the intended network.
- Estimate gas before beginning a large batch.
- Handle nonce, replacement, timeout, and user-rejection errors distinctly.
- Do not claim success until the receipt is confirmed.
- Persist transaction hashes so a page refresh does not lose operational history.

## Smart contract configuration

`lib/contract-config.ts` contains the current contract settings:

```text
address: 0x97161a87229d3A8E0Bd2Fbcd408eE6c9f65823ae
chainId: 42220
name: Minet
symbol: MINET
RPC: https://forno.celo.org
```

The ABI currently describes the functions and event needed by the application:

- `mint(address to, string tokenURI)`
- `ownerOf(uint256 tokenId)`
- `balanceOf(address owner)`
- `tokenURI(uint256 tokenId)`
- `CredentialMinted(address to, uint256 tokenId, string tokenURI)`

The configured address and ABI must be treated as deployment-specific data. If the contract changes, update the ABI and address together, document the deployment, and run a test mint on a non-production or controlled wallet before enabling the new configuration.

A future revision should move network and contract configuration to validated environment variables or an administrator-controlled settings table. Hardcoded production addresses are easy to overlook during deployment and make multi-network support more difficult.

## Batch persistence

Batch persistence is implemented with server actions and database utilities. A saved batch includes a name, optional description, wallet count, wallet JSON data, total mints, total funded amount, and timestamps.

The SQL schema creates the following columns:

| Column | Purpose |
| --- | --- |
| `id` | UUID primary key |
| `name` | Human-readable batch name |
| `description` | Optional batch description |
| `wallet_count` | Number of wallets in the batch |
| `wallet_data` | JSONB representation of wallet records |
| `total_mints` | Aggregate mint counter |
| `total_funded` | Aggregate funding amount stored as text |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

An index on `created_at` supports recent-batch queries. A database trigger updates `updated_at` on changes.

### RLS status

The schema enables Row Level Security but currently installs an allow-all policy. This is suitable only for controlled development. Before production, add an owner column such as `user_id UUID REFERENCES auth.users(id)`, populate it from the authenticated session, and replace the broad policy with policies that require `user_id = auth.uid()`.

Do not store private keys in a shared table without a very deliberate security design. The current schema's `wallet_data` JSONB field can contain private keys because the dashboard passes wallet records to the save action. This should be redesigned before storing production wallet data remotely.

## API routes and server actions

The project contains server actions and route handlers for batch operations.

### Server actions

`app/actions.ts` exposes:

- `saveBatchAction(name, wallets, description)`: saves a named batch.
- `getAllBatchesAction()`: returns all available batches.
- `getBatchByIdAction(id)`: loads a batch by UUID.
- `updateBatchAfterFundingAction(id, totalFunded)`: updates aggregate funding information.
- `updateBatchMintsAction(id, totalMints)`: updates aggregate mint information.

These functions catch errors and either return an error object, an empty list, or rethrow depending on the operation. Callers should handle these outcomes explicitly and show actionable feedback rather than silently treating an error as an empty dataset.

### Route handlers

`app/api/batch-fund/route.ts` provides a route-level entry point for batch funding-related operations. `app/api/batch/[id]/route.ts` handles operations associated with a particular batch identifier. When modifying these handlers, validate the route parameter, validate request bodies with Zod or an equivalent schema, authenticate the request, authorize access to the batch, and never trust client-supplied totals.

All funding and mint totals should be recomputed from trusted transaction records where possible. Client-side aggregate values are convenient for display but should not be treated as financial truth.

## Environment variables

The application uses Supabase variables and may use additional deployment-provided variables depending on the selected environment.

Typical variables include:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL
```

The `NEXT_PUBLIC_` prefix means the value can be included in browser bundles. Only use that prefix for values that are safe to expose. The service-role key must remain server-only.

In Vercel, configure variables for the correct environments: Development, Preview, and Production. After changing environment variables, redeploy because existing builds do not automatically receive newly configured values.

Never commit `.env`, `.env.local`, `.env.development.local`, or any generated secret file. When reporting an environment issue, share variable names and error messages, not secret values.

## Local development

### Prerequisites

Install the following before starting:

- Node.js compatible with the Next.js 16 project.
- pnpm 9 or pnpm 10.
- A Supabase project with the required environment variables.
- A browser wallet such as MetaMask if testing blockchain actions.
- Access to the configured Celo network.

### Install dependencies

```bash
pnpm install
```

### Configure environment

Create a local environment file using the variable names required by the project. Do not commit it. Use the Supabase dashboard values for the URL and anonymous key, and use the service-role key only when trusted server operations require it.

### Start development

```bash
pnpm dev
```

Next.js starts the development server and provides hot reload. Open the local URL printed by Next.js. Visit the login route first, authenticate, and then open the dashboard.

### Useful scripts

```bash
pnpm dev       # Start the development server
pnpm build     # Create an optimized production build
pnpm start     # Start the production server after a build
pnpm lint      # Run ESLint
```

When debugging a deployment issue, run the same build command used by Vercel: `pnpm run build`. A successful local development server does not guarantee a successful production build.

## Production deployment

Mintition can be deployed through Vercel using the repository's main branch or a feature branch connected to a preview deployment. The deployment should use pnpm and the lockfile should remain committed.

Before deploying:

1. Confirm the intended branch and commit.
2. Confirm Supabase variables are configured in the Vercel project.
3. Confirm the Supabase redirect URLs include the deployment hostname.
4. Confirm the contract address and chain ID.
5. Confirm the deployed app uses the intended Supabase project.
6. Run `pnpm lint` and `pnpm build`.
7. Test login, logout, wallet generation, a small funding transaction, and a controlled mint.
8. Review the deployment logs for environment, route, and build errors.

The repository was originally synchronized with v0.app and Vercel. Continue using the team's Git and deployment workflow so branch history remains clear. Never push unreviewed changes directly to the default branch when a pull request workflow is available.

## Database setup

The initial schema is in `scripts/create_wallet_batches.sql`. Run it in the Supabase SQL editor or through the team's approved migration process.

The script:

1. Creates the `wallet_batches` table if it does not exist.
2. Adds a UUID primary key.
3. Stores wallet data as JSONB.
4. Adds counters for mints and funding.
5. Adds creation and update timestamps.
6. Creates an index for recent batches.
7. Enables RLS.
8. Creates the current broad policy.
9. Adds a trigger to update `updated_at`.

For production, replace the broad policy before allowing multiple users or untrusted traffic. Add migrations rather than editing a live table manually without recording the change.

## Security model

Mintition has four important security boundaries:

### Identity boundary

Supabase Auth identifies the current user. Route protection prevents unauthenticated access to the dashboard. Authentication alone does not automatically scope database rows or authorize administrative actions.

### Browser boundary

The browser holds React state, MetaMask access, and currently generated private keys. Anything held by the browser should be considered exposed to the current origin and the local machine. Avoid third-party scripts, unnecessary analytics, and unsafe HTML in pages that handle keys.

### Server boundary

Server actions and server utilities can access Supabase. The service-role client bypasses RLS, so its use must be narrowly scoped, validated, and never imported into a client component.

### Blockchain boundary

Blockchain transactions are irreversible or difficult to reverse. The application must show clear destination addresses, amounts, network, contract, and transaction status before signing. A successful UI notification should correspond to a confirmed receipt, not just a submitted request.

### Security requirements for future work

- Add user ownership to every persisted batch.
- Replace allow-all RLS with user-scoped policies.
- Never persist raw private keys in plaintext remotely.
- Avoid logging addresses and transaction details unnecessarily, and never log private keys.
- Validate all addresses with ethers utilities.
- Validate numeric amounts with strict decimal rules.
- Add rate limiting to server endpoints.
- Add CSRF and origin protections where custom state-changing routes require them.
- Keep dependencies patched.
- Review third-party scripts and analytics.
- Use security headers in the deployed Next.js configuration.
- Add audit events for funding and minting actions without storing secrets.

## Operational safety

Blockchain automation should be operated like a financial system. Use a runbook and require a second review for large batches or high-value funding.

A safe run should document:

- Operator identity.
- Date and time.
- Source account address.
- Network and chain ID.
- Contract address.
- Batch identifier.
- Wallet count.
- Amount per wallet.
- Expected total and gas reserve.
- Transaction hashes.
- Receipt status.
- Any failed or retried operations.

Use a small canary batch before a large run. Confirm the canary wallet received the expected CELO, confirm the mint event, and only then continue. Do not rely solely on toast messages or a local balance display.

## Troubleshooting

### The dashboard redirects to login

Check that the Supabase URL and anonymous key are correct, the user exists in the configured Supabase project, cookies are allowed by the browser, and the deployment URL is included in the Supabase authentication redirect configuration. Inspect the proxy and server logs for session errors.

### MetaMask is not detected

Install or unlock MetaMask, open the application in the same browser profile, and verify that the page is not running in a browser that blocks injected providers. If the provider was installed after the page loaded, refresh the page.

### MetaMask says a request is pending

Open the wallet extension and resolve the existing connection request. Do not repeatedly click the connect button while the request is pending.

### The wrong network is selected

Switch MetaMask to Celo mainnet. The configured chain ID is `42220`. Add programmatic chain validation before funding or minting, because a user-entered network ID is not sufficient protection.

### Funding fails because of insufficient balance

The connected account must hold enough CELO for the sum of all transfers plus transaction gas. Reduce the amount or wallet count, or fund the connected account first. Remember that displayed balance values may be stale; re-read the provider balance immediately before starting.

### A wallet is marked funded but the balance looks wrong

The current UI updates the displayed wallet balance based on the requested funding amount after a successful receipt. It may not account for later outgoing transfers, pending state, or unrelated deposits. Query the chain directly for the authoritative balance.

### Minting fails

Verify the contract address, ABI, chain, signer, recipient address, token URI, and account balance. Inspect the transaction error and the contract's revert reason. Confirm that the caller is allowed to mint and that the token URI meets contract expectations.

### Batch data is missing

Check that the SQL table exists, the server environment variables point to the intended Supabase project, the user has permission under RLS, and the server action did not return an error object. Review deployment logs without exposing any secret values.

### Production build fails during parsing

Run `pnpm run build` locally and inspect the first file and line reported. Parsing errors often come from corrupted imports, missing braces, invalid JSX, or merge conflicts. Fix the source error rather than changing deployment settings first.

### A deployment has stale environment values

Vercel environment changes apply to new deployments. Confirm the variable is set in the correct environment and trigger a fresh deployment after changing it.

## Validation and quality checks

The minimum validation sequence for a meaningful change is:

```bash
pnpm lint
pnpm build
```

For UI changes, also open the preview in a real browser and check:

- Login and logout.
- Dashboard rendering in light and dark themes.
- Mobile and desktop layout.
- Keyboard navigation.
- Loading and disabled states.
- Toast notifications.
- Error messages.
- MetaMask connection behavior.

For blockchain changes, use a controlled account and a small amount of CELO. Verify receipts and events on a Celo block explorer. Do not use production funds during development.

For database changes, verify migrations against a development Supabase project, test authenticated and unauthenticated access, test RLS policies with more than one user, and confirm that server-only secrets never appear in the client bundle.

## Contribution workflow

Keep changes small and focused. Before modifying code:

1. Read the relevant component, utility, route, and type definitions.
2. Identify where state originates and where it is consumed.
3. Reuse existing UI primitives and styling conventions.
4. Preserve unrelated behavior.
5. Add validation for new user inputs.
6. Run the narrowest relevant check first.
7. Run lint and production build before opening a pull request.
8. Describe security implications for changes involving wallets, keys, auth, database access, or transactions.

Use descriptive commits such as:

```text
Fix dashboard build parsing
Add authenticated batch ownership
Validate Celo chain before funding
Persist mint transaction receipts
```

Do not commit environment files, wallet CSV exports, private keys, build output, or temporary debug logs.

## Design and accessibility

The application uses cards, tabs, inputs, alerts, buttons, labels, toast notifications, and icons to structure a complex operational workflow. Preserve semantic labels and connect each input to its label. Loading buttons should communicate their state to screen readers and should not allow duplicate submissions.

Every destructive operation should have a clear label and, where appropriate, a confirmation step. Address strings should be displayed in a readable way but remain copyable. Do not use color alone to communicate success or failure; pair color with text and an icon or status label.

The dashboard should remain usable at narrow widths. Large tables and wallet lists should scroll without causing the entire page to become difficult to navigate. Keep focus visible, provide keyboard access to tabs and dialogs, and ensure toast messages do not contain the only copy of a critical transaction result.

## Performance considerations

Wallet generation is local and usually inexpensive, but very large batches can make the browser state and rendered wallet list heavy. Add maximum batch sizes and virtualization if the application is extended to hundreds or thousands of wallets.

Sequential blockchain transfers are reliable but slow for large sets. A future queue should track each transaction independently, support retries with idempotency awareness, and survive a page refresh. Never parallelize transactions without understanding nonce management, provider limits, wallet balance requirements, and the contract's expected behavior.

Database queries should select only needed columns, paginate large batch lists, and avoid repeatedly loading complete JSONB wallet data when only metadata is needed. Consider a normalized wallet table if batch contents become large or need independent querying.

## Known limitations

The current implementation has several limitations that should be understood before production use:

1. Wallet private keys are stored in browser local storage and may also be included in saved batch data.
2. The wallet batch database policy is allow-all and is not sufficient for multi-user production isolation.
3. The active wallet and batch state is spread across browser state, local storage, and Supabase rather than a single durable workflow model.
4. MetaMask account and network change events need stronger synchronization with React state.
5. Some batch state uses broad types such as `any[]`.
6. Funding and minting progress can be lost if the browser closes before the application persists results.
7. A displayed balance may represent the requested funding amount rather than a fresh chain read.
8. Contract settings are hardcoded rather than centrally administered per environment.
9. Client-side totals should not be treated as authoritative financial records.
10. CSV parsing is intentionally simple and may not correctly handle every escaped comma or newline.
11. Large batches may require more robust queueing, retry, and rate-limit behavior.
12. A successful transaction submission is not sufficient evidence of a completed business operation until the receipt and expected event are confirmed.

These limitations do not make the application unusable for controlled testing, but they should be addressed before handling valuable assets or sensitive organizational workflows.

## Recommended roadmap

### Phase one: harden the current workflow

- Add explicit chain validation.
- Add account and chain change listeners.
- Add address and amount validation with Zod.
- Add confirmation dialogs for replacement, funding, and minting.
- Add maximum batch size and gas-reserve calculations.
- Replace broad batch types with shared TypeScript interfaces.
- Improve transaction error classification.
- Persist transaction hashes and receipt status.

### Phase two: improve data security

- Remove raw private keys from remote batch records.
- Add per-user batch ownership and strict RLS policies.
- Add audit records that contain no secrets.
- Replace plaintext local storage with a safer key workflow or external signer.
- Add environment-specific contract configuration.
- Add security headers and dependency scanning.

### Phase three: build durable execution

- Introduce a transaction queue with one record per transfer and mint.
- Make retries safe and explicit.
- Resume pending work after a browser refresh.
- Add idempotency keys and nonce management.
- Add server-side reconciliation against chain receipts.
- Add a failed-operation review screen.

### Phase four: operational scale

- Add role-based permissions.
- Add batch templates without private keys.
- Add CSV validation with clear row-level errors.
- Add explorer links for every transaction.
- Add reporting and export that excludes secrets by default.
- Add controlled testnet support.
- Add monitoring for failed transactions, provider errors, and database errors.

## Glossary

**Address**: The public hexadecimal identifier of a blockchain account or contract.

**ABI**: Application Binary Interface. The description ethers.js uses to encode contract calls and decode events.

**Batch**: A named collection of wallets managed together.

**CELO**: The native token of the Celo network, used for transaction fees and transfers.

**Chain ID**: Numeric identifier for a blockchain network. Celo mainnet uses `42220`.

**Contract**: A deployed blockchain program with callable functions and emitted events.

**Credential**: The digital asset or record minted by the configured contract.

**Gas**: The execution fee required to submit a blockchain transaction.

**MetaMask**: A browser wallet that injects an Ethereum-compatible provider and asks the user to approve transactions.

**Nonce**: A sequential transaction number used by an account to order transactions.

**Private key**: A secret value that authorizes transactions from a wallet. Anyone with it can control the wallet's assets.

**Receipt**: The mined result of a submitted transaction, including status, block information, and logs.

**RLS**: Row Level Security, a PostgreSQL and Supabase feature that controls which rows a user may access.

**Signer**: An ethers.js object capable of authorizing blockchain transactions.

**Token URI**: A string identifying metadata associated with a minted token or credential.

**Transaction hash**: The identifier assigned to a submitted blockchain transaction.

## Final operational reminder

Mintition makes repetitive wallet and credential workflows easier, but automation does not remove the need for verification. Always confirm the active account, network, contract, recipient addresses, amounts, and transaction receipts. Use test accounts during development, keep secrets out of logs and source control, and review the security limitations in this document before moving from controlled testing to production.

## Links

- Project repository: `https://github.com/absalemaroon/mintition`
- Vercel deployment project: `https://vercel.com/absalexlabs/v0-mintition`
- v0 project: `https://v0.app/chat/4OjhWpAbOvp`
- Celo documentation: `https://docs.celo.org/`
- Supabase documentation: `https://supabase.com/docs`
- Next.js documentation: `https://nextjs.org/docs`
- ethers.js documentation: `https://docs.ethers.org/`

This README should be updated whenever the authentication model, database schema, blockchain network, contract ABI, wallet custody model, deployment process, or supported user workflow changes.

<!-- End of README -->
