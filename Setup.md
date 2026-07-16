# CodeArena - Setup Guide

Follow these steps to get CodeArena running locally.

## Prerequisites

- **Docker Desktop** — [Download here](https://www.docker.com/products/docker-desktop/) and install it on your PC or laptop.

## 1. Pull the Docker Images

Open a terminal inside Docker Desktop (bottom-right corner) and run the following commands one by one:

```bash
docker pull phantom10/codearena-frontend:tagname
docker pull phantom10/codearena-worker:tagname
docker pull phantom10/codearena-api:tagname
```

## 2. Get the Docker Compose File

Create a new folder, open a terminal inside it, and run:

```bash
curl -O https://raw.githubusercontent.com/Rudra2609/CodeArena/main/docker-compose.yml
```

## 3. Download the Chrome Extension

1. Go to [downgit.github.io](https://downgit.github.io/)
2. Paste the following link:
   ```
   https://github.com/Rudra2609/CodeArena/tree/0073815e7eaf9d1851f12831406878639dc0f106/chrome-extension
   ```
3. Download the resulting ZIP file and extract it into your project folder.

## 4. Load the Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Turn on **Developer mode** (top-right corner).
3. Click **Load unpacked**.
4. Select the `chrome-extension` folder from your project folder (the one you extracted).

## 5. Create the Environment File

In your project folder, create a file named `.env` with the following content:

```env
POSTGRES_PASSWORD = Any_Password_You_Want
```

## 6. Start the Containers

Open a new terminal in your project folder and run:

```bash
docker compose up -d
```

## 7. Access CodeArena

Once everything is up and running, open your browser and go to:

```
http://localhost:8080
```

---

✅ You're all set — CodeArena should now be running locally.
