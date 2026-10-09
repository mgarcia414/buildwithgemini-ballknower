# BALLKNOWER — Weekend Sports Guide

The original retro CFB / UFC television guide, rebuilt as a static website. The browser fetches ESPN schedules and statistics directly. No Gemini, agent, Google login, API key, database, cloud function, model credits, or paid backend is required.

## Run it on your computer

On Windows, double-click **Start Ballknower.cmd**. Python 3 is required; no packages need installing. Keep its terminal open while using the guide, and close it when finished.

Or, from the project folder:

```sh
python serve.py --open
```

Open **http://127.0.0.1:8080**. If that port is occupied, use `python serve.py --port 8081 --open`. The server only serves the files in `docs/` on your own computer. It does not process sports data or contact Google. An internet connection is needed to fetch ESPN data and the original display fonts. Don't open `index.html` directly: browser modules and local JSON need an HTTP origin.

## Keep it online without a paid server

This public repository can use GitHub Pages on GitHub Free. No build, npm installation, scheduled workflow, or server is needed.

1. Commit/push this version to the branch you want to publish.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select your updated branch and the **/docs** folder, then save.
5. Open the URL GitHub reports after deployment completes.

The expected project address is `https://mgarcia414.github.io/buildwithgemini-ballknower/`; it is not live until Pages is enabled and deployment succeeds. Relative file paths support the repository subdirectory. The `docs/` folder can also be uploaded to any static host, subject to that provider's terms.

[GitHub Pages availability and documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## What is retained

- Brick logo, turf background, horizontal TV grid and overlapping channel lanes.
- Previous/next Saturday navigation, with Pacific time and correct PST/PDT handling.
- Favorite teams (Georgia Tech, Fresno State and Notre Dame by default), saved on this browser/device. Favorites only is an optional filter.
- CFB rankings, supplied odds, scores, broadcast networks, venues, and game details. Hover or click a game to load the actual last five completed results before that game.
- UFC card windows and a fight inspector with published fighters, records and weight classes.
- Simple rules for live alerts: a fourth-quarter game within eight points involving a ranked team, or an unranked team leading a ranked team in the third quarter or later. Favorites are excluded from those alerts.

The agent panel, chat endpoint, A2UI, predictions, generated graphics, Firestore, Google SDKs, cloud deployment files, agent tests and their lockfile were removed. The previous implementation remains in Git history. The `.agents/` folder contains the original workshop's development helpers; it is not loaded or published by the site.

## Data behavior and limits

- Uses public ESPN scoreboard and team schedule endpoints with browser CORS support verified on October 9, 2026. These are **undocumented endpoints**, with no availability or long-term access guarantee. There is no paid fallback. If ESPN changes access, the adapter in `docs/sports-data.js` will need updating.
- Fetches Saturday and the adjacent calendar date, then filters to Pacific Saturday so late games survive the UTC date boundary. ESPN's supported `limit=100` is intentional: `limit=1000` was observed silently returning only 25 games.
- Scores/schedules are cached for one minute, team histories for one hour. Repeated simultaneous requests share the same fetch. Only a visible tab showing today's slate refreshes automatically, once per minute; manual Refresh also respects the feed cache.
- If a request fails, cached schedules up to six hours old can be displayed **with a warning and the original update time**. Team histories have a one-day stale limit. If no cache exists, show a partial-feed warning or an unavailable state. No sample games or fabricated stats are inserted.
- Missing networks, odds, records and kickoff times are explicitly unavailable/TBA. A kickoff with no confirmed time appears below the timed grid.
- Football blocks are 3.5-hour display estimates; UFC blocks are 3-hour estimates. UFC bouts are grouped by published card start, not guessed prelim/main labels or made-up walk times. Individual bout order can change.
- The favorite-team catalog is a bundled snapshot of active teams in ESPN's FBS group from October 9, 2026. Favorites persist locally and do not sync across devices. Recent form uses the selected season, plus its regular season for a postseason matchup; it does not pull the previous year's games to fill five slots.
- ESPN data access does not include TV subscriptions or streaming rights. Fonts load from Google Fonts; that is unrelated to Google Cloud or Gemini billing.

## Existing Google Cloud charges

**Running or publishing this replacement does not stop the old deployment or cancel its billing.** No cloud resources were changed by this rebuild.

After confirming the replacement works, review the old project's Agent Engine/Vertex AI deployment, Cloud Run service, Firestore, storage buckets, container images, logs and scheduled jobs. Export anything you want to keep before deleting resources. If the project was only for this workshop, you can choose to shut down that project after reviewing its contents; do not shut down a shared project. Removing the old resources is a separate action.

## Maintenance and tests

```sh
npm test
```

Node 22+ is only needed to run the dependency-free tests. The app itself needs no Node runtime, Python backend framework, package installation, secrets, or build process. `serve.py` uses the Python standard library solely for local preview.

```text
docs/index.html       Original visual layout, agent panel removed
docs/app.js           Favorites, grid, details, and refresh controls
docs/sports-data.js   Fetching, bounded cache, dates, and data normalization
docs/fbs_teams.json   Bundled favorite-team picker catalog
serve.py             Optional local static file server
test/                Offline data regression tests
```
