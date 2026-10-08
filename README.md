# 🏈 BALLKNOWER — Weekend Sports TV Guide & AI Agent

<div align="center">

### A 90s retro-styled interactive Sports TV Guide & Agent-First Assistant for College Football & UFC

Built during the **Build with Gemini** workshop with Google Cloud Agent Platform, ADK, and Gemini.

</div>

---

## 🌟 Overview

**BALLKNOWER** is an agentic sports intelligence hub that combines:
1. **Interactive Retro TV Guide**: An 8-bit turf styled broadcast matrix charting games across major sports networks (ABC, CBS, ESPN, FOX, FS1, Paramount+) and Saturday broadcast windows.
2. **Dynamic Slot Stacking**: Automatic lane-dropping for games sharing a station without overlap collisions.
3. **UFC Fight Card Inspector**: Interactive full fight roster cards with estimated start times, bout-by-bout records, weight classes, and main card vs. prelim distinctions.
4. **CFB Game Intel Popovers**: On-hover telemetry displaying game betting lines (spread & over/under) and last 5 game results (with W/L pills).
5. **Favorite Team Filtering**: Instant multi-select filter featuring all 130+ NCAA FBS teams (with Georgia Tech, Fresno State, and Notre Dame selected by default).
6. **Agent-First Assistant**: A conversational ADK agent deployed on Google Cloud Agent Platform (Reasoning Engine) powered by Gemini, capable of answering in-depth sports questions, researching matchups, and generating rich UI cards via A2UI.

---

## 📐 Architecture

```
                    ┌───────────────────────────┐
                    │       Web Browser         │
                    │   BALLKNOWER TV Guide UI  │
                    └─────────────┬─────────────┘
                                  │ HTTP / Static
                                  ▼
                    ┌───────────────────────────┐
                    │      FastAPI Proxy        │
                    │      (Cloud Run)          │
                    └─────────────┬─────────────┘
                                  │ A2A Protocol / REST
                                  ▼
        ┌───────────────────────────────────────────────────┐
        │       Vertex AI Reasoning Engine / Agent Engine   │
        │   ┌───────────────────────────────────────────┐   │
        │   │          ADK Agent (Gemini 2.5)           │   │
        │   │   - Firestore User Preferences & Favorites│   │
        │   │   - Sports Schedule & Matchup Tools       │   │
        │   │   - A2UI Rich Card Generator              │   │
        │   └───────────────────────────────────────────┘   │
        └───────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

- **Agent Framework**: [Google Agent Development Kit (ADK)](https://google.github.io/adk-docs/)
- **Deployment & Cloud**: Google Cloud Vertex AI Reasoning Engine / Agent Platform, Cloud Run
- **Frontend / Proxy**: FastAPI, HTML5, CSS Grid / Flexbox, Vanilla JavaScript, Material Symbols
- **State & Preferences**: Google Cloud Firestore
- **Protocols**: A2A Protocol, A2UI (Agent-to-User Interface)

---

## 📂 Project Structure

```
BuildWithGemini/
├── ballknower/
│   ├── app/                      # ADK Agent definition & tools
│   │   ├── agent.py              # Root agent reasoning loop & instructions
│   │   ├── sports_tools.py       # Sports data tools & betting/game models
│   │   ├── firestore_service.py  # User profile & team favorites persistence
│   │   ├── a2ui_utils.py         # A2UI rich response card formatting
│   │   └── fast_api_app.py       # Agent local entrypoint
│   ├── frontend/                 # Interactive TV Guide & Chat Frontend
│   │   ├── main.py               # FastAPI proxy & TV guide data provider
│   │   └── static/
│   │       └── index.html        # 8-bit turf layout, TV guide grid, sidebars
│   ├── agents-cli-manifest.yaml  # Deployment configuration
│   └── pyproject.toml            # Dependencies
└── README.md
```

---

## 🚀 Running Locally

### 1. Prerequisites
- Python 3.11+
- [`uv`](https://docs.astral.sh/uv/) installed
- Authenticated Google Cloud SDK (`gcloud auth application-default login`)

### 2. Run the Agent Locally (ADK Web)
```bash
cd ballknower
uv run adk web --port 8000 app
```

### 3. Run the Frontend & TV Guide
```bash
cd ballknower/frontend
uv run python main.py
```
Open **`http://localhost:8080`** in your browser to experience the BALLKNOWER Weekend Sports Guide.

---

## 🎮 Key Features in Detail

### 📺 8-Bit Turf TV Guide
- **Dynamic Grid**: Stations on the Y-axis (ESPN, FOX, CBS, ABC, FS1, Paramount+) and 30-minute time intervals across Saturday.
- **Lane Stacking**: Automatically stacks overlapping games within the same network row.
- **Week Pagination**: Jump between weeks with retro brick arcade arrows.

### 🥊 UFC Fight Card Drawer
- Click on any UFC Event block to open the inspector sidebar.
- Displays full fight cards with estimated bout walk times, weight division banners, and records flanking the matchup.

### 🏈 CFB Matchup Intel
- Hover over any NCAA Football tile to see the betting line (Spread & O/U) and the last 5 game outcomes with color-coded result badges.
