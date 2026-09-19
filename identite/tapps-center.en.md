# Odo · Telegram Apps Center listing (English)

The Telegram Apps Center (`tapps.center`, catalogue `@tapps_bot`) is the directory run by the TON
ecosystem. **Apps are submitted through the moderation bot `@app_moderation_bot`** ("Telegram
Apps Moderation"), not through the catalogue itself. It is not Telegram's own Mini App Store (that one is set up in BotFather, see
`identite/textes-botfather.md`), and it does not require any blockchain integration: Odo is
listed as it is, with no token and no wallet — rule 8 of `CLAUDE.md` stands.

**The submission is made from your own Telegram account**, inside `@app_moderation_bot`: nobody
can do it for you. Open the bot, press Start, choose to add an app, and answer its questions one by
one with the fields below. Everything the form asks for is below, ready to paste. Moderation takes three to eight
days. The exact labels of the bot's menus are not documented publicly; what is certain is the
list of fields. The French version of this file is `identite/tapps-center.md`.

## Before you press "Submit"

- [ ] The **Main Mini App** is enabled in BotFather (`/mybots` → Bot Settings → Configure Mini
      App → Enable Mini App, URL `https://mbolo-miniapp.fly.dev`). Without it, the bot's profile
      has no "Launch app" button.
- [ ] The bot answers `/start` in English to anyone whose Telegram is in English: it does
      (`server/i18n.js`, the language of whoever receives). The reviewer will see "Hi … Odo lets
      you meet verified people from your city…".
- [ ] Both public pages respond: `https://mbolo-miniapp.fly.dev/confidentialite` and
      `https://mbolo-miniapp.fly.dev/conditions`. They are required.
- [ ] The three items under "Avant d'ouvrir à de vraies personnes" in the README: a directory
      brings strangers.

## The fields

**Name**: `Odo`

**Tagline** (one line): `Verified people, face to face.`

**Category**: Social / Dating (pick "Social" if "Dating" does not exist).

**Short description** (if the form has one, 120 characters or fewer):

```
Verified people, face to face. Selfie required, no money requests, first meet-up in a public place.
```

**Description**:

```
Odo is where real people meet, in French-speaking Africa first.

Every profile is verified with a selfie and a requested gesture, checked by a real person. No money requests get through the chats: amounts, payment methods and phone numbers are blocked. Your username and phone number stay hidden.

The first meet-up happens in a public place, and someone you trust can be told where and when.

18 and over only. Light on data: nothing loads unless you ask for it. Works in French, English, Spanish, Portuguese, Swahili, Russian and Ukrainian.
```

**What makes it different** (if the form asks for highlights, one per line):

```
Every profile is selfie-verified with a random gesture, reviewed by a human.
Money requests, payment methods and phone numbers are blocked in chats.
Usernames and phone numbers are never shown.
First meet-up in a public place; a trusted person can be told where and when.
Built for entry-level Android phones and limited data plans.
```

**App link**: `https://t.me/<your_bot>/<mini_app_name>` (the `t.me` link of the Main Mini App,
as BotFather gives it). **Bot link**: `https://t.me/<your_bot>`.

**Icon**: `identite/odo-photo-1024.png` (1024 × 1024).

**Screenshots** — six slots, in this order, folder `identite/tapps-center/` (786 × 1454, dark
theme, taken on `main` on 18 September 2026):

| # | File | What it shows |
|---|---|---|
| 1 | `01-accueil.png` | The welcome screen and the four promises |
| 2 | `02-carte.png` | The deck: photo first, the question, "Verified", the three round buttons |
| 3 | `03-verification.png` | The selfie with a randomly drawn gesture |
| 4 | `04-match.png` | The match screen |
| 5 | `05-discussion.png` | The chat, with the links-and-numbers unlock line |
| 6 | `06-se-proteger.png` | "Protect yourself from this person": remove, block, report |

The screenshots are in French, the app's source language. If the form asks for English
screenshots, open the app with Telegram set to English and take them again on your phone: every
screen is translated. The profiles shown are demo profiles with initials, as there are no
portraits yet (audit 15, finding K). If you prefer real faces, take the screenshots on your phone
with members who agreed — never a stock photo library.

**Privacy policy**: `https://mbolo-miniapp.fly.dev/confidentialite`
**Terms of use**: `https://mbolo-miniapp.fly.dev/conditions`
**Support contact**: your address, or the bot (`/aide`).

**Blockchain / token**: none. If the form requires a choice, answer "none" or "not a Web3 app":
the directory accepts apps without Web3.

**Age rating**: 18+. It is stated on the welcome screen, in the description and in the terms.

## What can get a listing rejected

- An incomplete bot profile (no photo, no description, no Main Mini App).
- A `/start` that does not answer, or not in English for an English client.
- Screenshots that show something other than the app.
- A dating app may be asked for an 18+ notice: it is already on the welcome screen, in the
  description and in the terms.
