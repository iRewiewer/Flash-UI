# Flash UI

Private Flash game library for a Raspberry Pi or any Docker host. The app scans a `games` folder for `.swf` files, serves them through Ruffle, and stores editable metadata in JSON.

## Features

- React frontend with search and grid/list layouts
- Ruffle player with fullscreen support
- Automatic SWF discovery from `games/`
- Browser upload for SWF files and thumbnails
- Metadata editor for name, description, notes, tags, date added, play count, version, thumbnail, and Ruffle launch options
- Delete action that removes both the library entry and the SWF file from disk
- Favorite markers with a favorites-only library filter
- Three shell layouts: compact player rail, split library/player, and full-library browsing
- Options modal for changing the games folder path and settings JSON path used by the app
- Options for default player volume, metadata import/export, and browser storage cleanup
- JSON metadata stored at `games/metadata.json`
- Docker setup using a bind mount for persistent game files

## Local Development

Install dependencies:

```bash
npm install
```

Run the API and Vite frontend together:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

The dev server proxies `/api` and `/ruffle` to the local API on port `3001`.

## Docker

Build and run:

```bash
docker compose up --build -d
```

Open:

```text
http://localhost:8020
```

On the Pi, clone the repo, copy or mount SWFs into `games/`, then run the same compose command. Tailscale can expose the Pi host while the app itself stays bound to your private network.

## Games Folder

```text
games/
  metadata.json
  thumbnails/
  example.swf
config/
  settings.json
```

The server creates missing storage files/directories at startup. SWF files can be placed in `games/` manually or uploaded from the website.

The options modal stores container-absolute paths for the games folder and settings JSON, such as `/data/games`. Missing folders and settings files are created automatically. In Docker, those paths are interpreted inside the container. To keep games or config on another drive, mount that drive into the container in `docker-compose.yml`, then set the path to the mounted container path.

## Metadata

Metadata is stored in `games/metadata.json`:

```json
{
  "games": {
    "example.swf": {
      "name": "Example Game",
      "description": "Short summary.",
      "notes": "Personal notes.",
      "tags": ["arcade", "favorite"],
      "favorite": false,
      "dateAdded": "2026-05-07T00:00:00.000Z",
      "timesPlayed": 0,
      "lastPlayedAt": null,
      "version": "original",
      "thumbnail": null,
      "launchOptions": {
        "parameters": {},
        "allowFullscreen": true,
        "backgroundColor": null
      }
    }
  }
}
```

`launchOptions` is passed to Ruffle's URL load options with the SWF URL added by the app.
