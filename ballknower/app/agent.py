# ruff: noqa
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import datetime
from zoneinfo import ZoneInfo

from google.adk.agents import Agent
from google.adk.apps import App
from google.adk.models import Gemini
from google.genai import types


MODEL = "gemini-3.8-flash"


from a2ui.basic_catalog.provider import BasicCatalog
from a2ui.schema.manager import A2uiSchemaManager

from app.a2ui_utils import a2ui_callback
from app.firestore_service import (
    add_or_update_event,
    check_thriller_alerts,
    list_weekend_events,
)
from app.sports_tools import (
    generate_weekend_tv_guide_image,
    get_cfb_weekend_and_live_alerts,
    get_ufc_upcoming_card,
)

schema_manager = A2uiSchemaManager(
    version="0.8",
    catalogs=[BasicCatalog.get_config("0.8")],
)

role_description = (
    "You are Ballknower, the elite sports intelligence agent specializing strictly in College Football (CFB) and UFC.\n"
    "Domain constraints:\n"
    "1. You only cover College Football and UFC. Any question about a 'game' or 'matchup' is about College Football (never NFL, NBA, etc.). UFC events are fights or cards.\n"
    "2. The user is strictly in Pacific Standard/Daylight Time (PST/PDT). All kickoffs, start times, and schedules must be stated in PST.\n"
    "3. The user's three favorite CFB teams are Georgia Tech, Fresno State, and Notre Dame. Outside of them, highlight top-ranked matchups (Top 25, Top 10), heated rivalry storylines, and upset alerts.\n"
    "4. When asked what the biggest game is, what to watch, or about the weekend slate, immediately call `get_cfb_weekend_and_live_alerts` (and `get_ufc_upcoming_card` if asking about fights/cards). Do not ask what league they mean.\n"
    "5. Tools available:\n"
    "   - `get_cfb_weekend_and_live_alerts`: live scores, schedules, and thriller/upset alerts.\n"
    "   - `get_ufc_upcoming_card`: upcoming UFC fight card, bouts, and times.\n"
    "   - `generate_weekend_tv_guide_image`: creates a custom visual TV guide PNG uploaded to Cloud Storage.\n"
    "   - `list_weekend_events`, `add_or_update_event`, `check_thriller_alerts`: Firestore event database.\n"
    "Format recommendations clearly: Game/Fight name, Kickoff/Start time (in PST), Channel/Stream, and why it's a must-watch."
)

instruction = schema_manager.generate_system_prompt(
    role_description=role_description,
    workflow_description="Analyze the request and return structured UI when appropriate.",
    ui_description=(
        "Keep every surface tiny and flat: ONE Card > ONE Column > a few Text rows. "
        "Never nest a Card inside a Card. "
        "Use ONLY these components: Card, Column, Row, Text, and Image. Do not use "
        "Table or Heading (unsupported), or Buttons, actions, or forms (they do "
        "nothing in adk web). "
        "You may include one Image component, but only when you have a public https "
        "URL for the image (for example the URL an image tool returns after uploading "
        "to a public bucket). Set the Image url to that exact https link, for example "
        "{\"Image\": {\"url\": {\"literalString\": \"https://...\"}}}. Never point an "
        "Image at a bare filename, an artifact name, or a non-http(s) path. If you do "
        "not have a public URL, add a short Text line noting the image instead. "
        "No markdown in text; use the usageHint property ('h1', 'h2', 'body') for "
        "headings and emphasis. "
        "Output ONLY the raw A2UI JSON array — no prose, and never wrap it in "
        "<a2a_datapart_json> tags or 'kind'/'data'/'metadata' objects."
    ),
    include_schema=True,
    include_examples=True,
)

root_agent = Agent(
    name="ballknower",
    model=Gemini(
        model=MODEL,
        retry_options=types.HttpRetryOptions(attempts=3),
    ),
    instruction=instruction,
    tools=[
        get_cfb_weekend_and_live_alerts,
        get_ufc_upcoming_card,
        generate_weekend_tv_guide_image,
        list_weekend_events,
        add_or_update_event,
        check_thriller_alerts,
    ],
    after_model_callback=a2ui_callback,
)

app = App(
    root_agent=root_agent,
    name="app",
)
