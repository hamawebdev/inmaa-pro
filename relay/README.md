# The centre's mailbox (Cloudflare Worker)

The centre's devices (the director's laptop, the assistant's laptop and the director's phone) exchange their
changes through this small program, which runs on Cloudflare's free plan, on the developer's own Cloudflare account.
It stores sealed envelopes and file parts it cannot open (the key never leaves the devices) and hands them back. It
accepts at most two active laptops and one active phone per centre. Why it was chosen, and what it keeps and for how
long: `docs/sync/DECISION.md`, sections 1, 2 and 6, and `docs/phone/DECISION.md`, section 2.

This mailbox speaks **sync protocol 2** (version 1.2.0 of the program, the first with the phone). Every request must
carry the header `x-inmaa-protocol: 2`; anything else is answered `426` with `x-relay-error: UPDATE_REQUIRED`, and
the program then shows «حدّث البرنامج على هذا الجهاز». So install 1.2.0 on both laptops before the phone joins.

You do this once. It takes about twenty minutes. You need a computer with internet, Node.js 20 or later
(`node --version` to check), `curl` (Windows 10 and later have `curl.exe`) and this repository, at version 1.2.0 or
later. No payment card is needed.

Nothing you create here goes into the repository: not the address, not the setup key, not your account id.

## 1. Create a free Cloudflare account

1. Open `https://dash.cloudflare.com/sign-up` in your browser.
2. Type your e-mail address and a password, then **Sign up**.
3. Open the e-mail Cloudflare sends you and click the link in it to verify the address.
4. If the dashboard asks what you want to do, skip it (you do not need a domain or a website).

## 2. Choose your workers.dev name

1. In the dashboard, in the left-hand menu, open **Compute (Workers)** › **Workers & Pages** (the menu may say
   only **Workers & Pages**).
2. The first time, Cloudflare asks you to choose a **workers.dev subdomain**: a name of your own, for example
   `inmaa-dz`. Choose one and confirm. The mailbox's address will be `https://inmaa-relay.<that name>.workers.dev`.

If you skip this, the deploy in step 4 asks for it instead.

## 3. Sign in from the terminal

Open a terminal (on Windows: **PowerShell**) in this folder, `relay/`, of the repository:

```sh
cd "path/to/the/repository/relay"
npx wrangler@4 login
```

`npx` downloads Cloudflare's tool, `wrangler`, the first time (answer `y` if it asks). Your browser opens on
Cloudflare: click **Allow**. The terminal then says you are logged in. Check it:

```sh
npx wrangler@4 whoami
```

It prints your e-mail and your account. Nothing is written in the repository.

## 4. Deploy the mailbox

Still in `relay/`:

```sh
npx wrangler@4 deploy
```

It reads `wrangler.jsonc`, bundles `src/`, and sends it to your account. At the end it prints the address, for
example:

```
Deployed inmaa-relay triggers
  https://inmaa-relay.inmaa-dz.workers.dev
```

Write that address down: it is the **mailbox address**.

## 5. Set the setup key

The setup key stops anybody else from using your free allowance: creating a centre on the mailbox needs it. Make a
long random one:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

It prints 64 characters. Copy them, then:

```sh
npx wrangler@4 secret put SETUP_KEY
```

Paste the key when it asks `Enter a secret value:` and press Enter. Cloudflare keeps it encrypted and the Worker
reads it; nobody can read it back, not even you, so write it down now. Check that it is there:

```sh
npx wrangler@4 secret list
```

It lists `SETUP_KEY` (the name only).

## 6. Check the mailbox answers

```sh
curl -i -H "x-inmaa-protocol: 2" https://inmaa-relay.<your name>.workers.dev/v1/time
```

On Windows PowerShell, type `curl.exe` instead of `curl`. The answer must start with `HTTP/1.1 200` (or
`HTTP/2 200`), carry a line `x-relay-time: …`, and end with `{"now":…}` (the mailbox's time in milliseconds).

That an older program is refused (the same request without the header):

```sh
curl -i https://inmaa-relay.<your name>.workers.dev/v1/time
```

The answer must be `426` with `x-relay-error: UPDATE_REQUIRED`.

And that the setup key is checked (this creates nothing):

```sh
curl -i -X POST -H "x-inmaa-protocol: 2" -H "x-setup-key: wrong" -d '{"deviceName":"test"}' https://inmaa-relay.<your name>.workers.dev/v1/centres
```

The answer must be `403` with `x-relay-error: SETUP_KEY`. (In PowerShell, write the body as
`-d '{\"deviceName\":\"test\"}'`.)

## 7. Give the director two things

- the **mailbox address** (step 4), and
- the **setup key** (step 5).

Give them on paper or in person, not by e-mail or chat. The director types them once, in the program, in Settings ›
المزامنة, on the director's laptop. The assistant's laptop and the director's phone never need the setup key: each
joins with a pairing code made on a laptop («إضافة الحاسوب الثاني», «إضافة هاتف المدير»), and types only the
mailbox address and that code.

Neither goes into the repository, a commit, an issue or a message. If the setup key leaks, set a new one with step
5 again: the devices already in the centre keep working (they use their own device tokens, not the setup key).

## Later

- **Update the mailbox** after a change in `relay/src/`: `npx wrangler@4 deploy` again, from `relay/`. The stored
  envelopes stay. Never edit an existing `migrations` entry in `wrangler.jsonc`; a new Durable Object class is a new
  entry with a new tag.
- **Watch the free allowance**: dashboard › **Workers & Pages** › `inmaa-relay` › **Metrics** (requests a day,
  against 100,000), and **Storage & Databases** › **Durable Objects** (stored bytes, against 5 GB). The program
  shows the same: its sync page warns from 80% of storage, and refuses to send at 4.5 GB (`FULL_AT_BYTES` in
  `wrangler.jsonc`).
- **When a daily allowance is spent**, Cloudflare refuses requests until 00:00 UTC (01:00 in Algeria). The devices
  keep working and send what waited afterwards. Nothing to do. Three devices polling every 15 seconds while open use
  about 18,000 requests a day at most (the phone only while its app is open), far below the 100,000.
- **A new sync protocol** (a future version that changes the exchange): deploy the new mailbox only once every device
  has the new program, or the devices not yet updated show «حدّث البرنامج على هذا الجهاز» and wait.
- **See what the mailbox is doing**: `npx wrangler@4 tail` shows requests as they arrive (paths and statuses; the
  mailbox never logs a body). Ctrl+C stops it.
- **Remove the mailbox** (only if the centre stops syncing): `npx wrangler@4 delete`. Every envelope and file part
  on it is deleted. The devices keep their own data; they show that the mailbox cannot be reached.
- **Sign out of wrangler** on a shared computer: `npx wrangler@4 logout`.

## For the developer: trying it without an account

The tests run the Worker in process, on Durable Objects backed by `node:sqlite`: `npx vitest run relay` from the
repository's root (also part of `npm test`). To run it locally in Cloudflare's own runtime, from `relay/`:

```sh
printf 'SETUP_KEY=local-test-key\n' > .dev.vars
npx wrangler@4 dev --local --port 8787
curl -i -H "x-inmaa-protocol: 2" http://127.0.0.1:8787/v1/time
```

Ctrl+C stops it. `.dev.vars` and `.wrangler/` are ignored by git (`relay/.gitignore`); delete `.dev.vars` when done.

## What is in this folder

| File               | What it is                                                                   |
| ------------------ | ---------------------------------------------------------------------------- |
| `wrangler.jsonc`   | the Worker's settings: its name, its three Durable Object classes, the limit |
| `src/index.ts`     | the Worker: routes `/v1/…`, the protocol, the setup key, joins with a ticket |
| `src/mailbox.ts`   | one Durable Object per centre: devices, envelopes, acknowledgements, copies  |
| `src/parts.ts`     | file parts, in eight Durable Objects per centre                              |
| `src/directory.ts` | the pairing tickets, each for a laptop or the phone                          |
| `src/frames.ts`    | the binary format of a page of envelopes                                     |
| `src/cf.ts`        | the few Cloudflare types the code uses                                       |
| `test/fake-env.ts` | the Durable Objects on `node:sqlite`, for the tests and the program's tests  |
| `test/*.test.ts`   | the Worker's tests                                                           |
