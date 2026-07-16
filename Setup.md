# CodeArena - Quickstart Guide

Want to run CodeArena on your local machine? Because the entire platform is containerized and published on Docker Hub, you don't need to install Python, Node.js, or configure any complex environments. 

Just follow these 3 simple steps to get the entire 7-service microservice architecture running in seconds!

## Prerequisites
* You must have **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** installed and running on your computer.

---

## Step 1: Download the Compose File
You only need one file to run the entire project. Create a new folder on your computer, open a terminal inside that folder, and download the `docker-compose.yml` file:

**(Mac/Linux/Git Bash):**
```bash
curl -O https://raw.githubusercontent.com/Rudra2609/CodeArena/main/docker-compose.yml
```
*(Alternatively, you can just manually download the `docker-compose.yml` file from the GitHub repository and place it in an empty folder).*

## Step 2: Set your Database Password
CodeArena uses a secure PostgreSQL database. You need to set a password for it.

In the exact same folder as your `docker-compose.yml` file, create a new file named exactly `.env` (don't forget the dot at the beginning!) and paste the following inside:

```env
POSTGRES_PASSWORD=MySuperSecretPassword123
```
*(You can change the password to whatever you like, just make sure there are no spaces).*

## Step 3: Run the Application!
Open your terminal in that folder and run this single command:

```bash
docker compose up -d
```

### What happens now?
Docker will automatically reach out to Docker Hub and download the pre-compiled CodeArena images (`phantom10/codearena-api`, `phantom10/codearena-frontend`, `phantom10/codearena-worker`). 

Once the download finishes, Docker will boot up the entire system (Frontend, API, Worker, Redis, Postgres, and Nginx proxy).

---

## 🚀 Access the Platform

Once the terminal says `Started` for all containers, you can access the platform in your browser!

* **CodeArena Application:** [http://localhost:8080](http://localhost:8080)
* **API Documentation (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)
* **Live Task Monitoring (Flower):** [http://localhost:5555](http://localhost:5555)

> [!TIP]
> **Stopping the app:** To gracefully stop the platform, simply run `docker compose down` in your terminal. All of your saved code and database entries will persist securely on your hard drive for the next time you boot it up!