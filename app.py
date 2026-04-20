import json
import random
from pathlib import Path

import streamlit as st


st.set_page_config(
    page_title="Higher or Lower - NEONEX Edition",
    page_icon="🎯",
    layout="wide",
)

MAX_ROUNDS = 5
DATASET_CANDIDATES = ("higher_lower_top150.json", "higher_lower_top150")

COLORS = {
    "background": "#003C73",
    "text": "#FFFFFF",
    "accent": "#FF5F50",
    "card": "#0A4D8C",
    "surface": "#145A96",
    "muted": "#D9E6F2",
    "positive": "#2ECC71",
    "negative": "#E74C3C",
    "border": "#6E93B7",
    "inactive": "#89A9C7",
}

st.markdown(
    f"""
    <style>
    .stApp {{
        background: {COLORS["background"]};
        color: {COLORS["text"]};
    }}
    .block-container {{
        max-width: 1180px;
        padding-top: 1.8rem;
        padding-bottom: 2.4rem;
    }}
    h1, h2, h3, h4, p, label, span {{
        color: {COLORS["text"]} !important;
    }}
    .hero {{
        text-align: center;
        margin-bottom: 1.8rem;
    }}
    .hero h1 {{
        font-size: 2.6rem;
        margin-bottom: 0.35rem;
        letter-spacing: 0.01em;
    }}
    .subtle {{
        color: {COLORS["muted"]};
        margin-top: 0;
        margin-bottom: 0.9rem;
        font-size: 1rem;
    }}
    .hero-badge {{
        display: inline-block;
        background: rgba(10, 77, 140, 0.95);
        border: 1px solid {COLORS["border"]};
        border-radius: 999px;
        padding: 0.35rem 0.9rem;
        color: {COLORS["muted"]};
        font-size: 0.86rem;
        margin-top: 0.25rem;
    }}
    .surface {{
        background: rgba(10, 77, 140, 0.38);
        border: 1px solid {COLORS["border"]};
        border-radius: 20px;
        padding: 1.2rem;
        backdrop-filter: blur(2px);
    }}
    .neo-card {{
        background: {COLORS["card"]};
        border: 1px solid {COLORS["border"]};
        border-radius: 18px;
        padding: 1.25rem;
        min-height: 280px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
    }}
    .lobby-card {{
        background: rgba(10, 77, 140, 0.96);
        border: 1px solid {COLORS["border"]};
        border-radius: 18px;
        padding: 1rem 1rem 1.15rem 1rem;
        min-height: 265px;
    }}
    .card-head {{
        font-size: 1.15rem;
        font-weight: 700;
        margin-bottom: 0.7rem;
    }}
    .card-label {{
        color: {COLORS["muted"]};
        font-size: 1.02rem;
        line-height: 1.45;
        min-height: 92px;
    }}
    .big-value {{
        font-size: 3.6rem;
        font-weight: 800;
        text-align: center;
        line-height: 1.1;
        letter-spacing: 0.01em;
    }}
    .play-stage {{
        background: rgba(10, 77, 140, 0.4);
        border: 1px solid {COLORS["border"]};
        border-radius: 22px;
        padding: 1rem;
        margin-top: 0.8rem;
    }}
    .vs {{
        display: flex;
        height: 100%;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
        font-weight: 800;
        color: {COLORS["muted"]};
        letter-spacing: 0.04em;
    }}
    .status-box {{
        background: {COLORS["surface"]};
        border: 1px solid {COLORS["border"]};
        border-radius: 14px;
        padding: 0.9rem 1rem;
        margin-bottom: 1.1rem;
    }}
    .top-bar {{
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 0.7rem;
        margin-bottom: 0.4rem;
    }}
    .top-item {{
        background: rgba(20, 90, 150, 0.95);
        border: 1px solid {COLORS["border"]};
        border-radius: 12px;
        padding: 0.6rem 0.8rem;
    }}
    .top-item .k {{
        color: {COLORS["muted"]};
        font-size: 0.82rem;
    }}
    .top-item .v {{
        font-size: 1.05rem;
        font-weight: 700;
    }}
    .pill {{
        display: inline-block;
        background: rgba(20, 90, 150, 0.95);
        border: 1px solid rgba(110, 147, 183, 0.9);
        border-radius: 999px;
        padding: 0.3rem 0.75rem;
        margin-right: 0.45rem;
        margin-bottom: 0.5rem;
        font-size: 0.93rem;
    }}
    .leader {{
        border-left: 6px solid {COLORS["accent"]};
    }}
    .rank-list {{
        display: grid;
        gap: 0.55rem;
        margin-top: 0.9rem;
    }}
    .rank-row {{
        background: rgba(10, 77, 140, 0.9);
        border: 1px solid {COLORS["border"]};
        border-radius: 12px;
        padding: 0.65rem 0.85rem;
        display: grid;
        grid-template-columns: 70px 1fr 90px;
        align-items: center;
        font-size: 1rem;
    }}
    .rank-row.top {{
        border-color: {COLORS["accent"]};
        background: rgba(20, 90, 150, 1);
    }}
    .empty-state {{
        border: 1px dashed {COLORS["border"]};
        border-radius: 12px;
        padding: 1rem;
        color: {COLORS["muted"]};
        text-align: center;
        margin-top: 0.4rem;
    }}
    .stButton > button {{
        width: 100%;
        min-height: 46px;
        border-radius: 12px;
        border: 1px solid {COLORS["border"]};
        color: {COLORS["text"]};
        background: rgba(20, 90, 150, 0.95);
        font-weight: 700;
        letter-spacing: 0.01em;
        transition: all 0.18s ease;
    }}
    .stButton > button:hover {{
        transform: translateY(-1px);
        border-color: {COLORS["accent"]};
        color: {COLORS["text"]};
    }}
    div[data-testid="stTextInput"] input {{
        min-height: 46px;
        border-radius: 12px;
        background: rgba(10, 77, 140, 0.95);
        color: {COLORS["text"]};
        border: 1px solid {COLORS["border"]};
    }}
    .primary-cta .stButton > button {{
        background: {COLORS["accent"]};
        border-color: {COLORS["accent"]};
        color: {COLORS["text"]};
        min-height: 50px;
        font-size: 1.05rem;
    }}
    .action-row .stButton > button {{
        min-height: 56px;
        font-size: 1.08rem;
    }}
    .mini-note {{
        font-size: 0.86rem;
        color: {COLORS["muted"]};
        text-align: center;
        margin-top: 0.35rem;
    }}
    </style>
    """,
    unsafe_allow_html=True,
)


def find_dataset_path() -> Path:
    base_dir = Path(__file__).resolve().parent
    for candidate in DATASET_CANDIDATES:
        candidate_path = base_dir / candidate
        if candidate_path.exists():
            return candidate_path

    matches = sorted(base_dir.glob("higher_lower_top150*"))
    if matches:
        return matches[0]

    raise FileNotFoundError(
        "Datensatz 'higher_lower_top150' wurde im App-Ordner nicht gefunden."
    )


def normalize_question(raw: dict, index: int) -> dict:
    canonical = {
        "id": str(raw.get("id") or f"q{index + 1:03d}"),
        "left_label": raw.get("left_label") or raw.get("left") or raw.get("label_left"),
        "left_value": raw.get("left_value") or raw.get("leftValue") or raw.get("value_left"),
        "right_label": raw.get("right_label") or raw.get("right") or raw.get("label_right"),
        "right_value": raw.get("right_value") or raw.get("rightValue") or raw.get("value_right"),
    }

    required_fields = ("left_label", "left_value", "right_label", "right_value")
    missing_fields = [field for field in required_fields if canonical.get(field) in (None, "")]
    if missing_fields:
        raise ValueError(f"Fehlende Felder in Frage {canonical['id']}: {', '.join(missing_fields)}")

    canonical["left_label"] = str(canonical["left_label"]).strip()
    canonical["right_label"] = str(canonical["right_label"]).strip()
    canonical["left_value"] = int(canonical["left_value"])
    canonical["right_value"] = int(canonical["right_value"])
    return canonical


@st.cache_data(show_spinner=False)
def load_questions() -> list[dict]:
    dataset_path = find_dataset_path()
    with dataset_path.open("r", encoding="utf-8") as file:
        raw_questions = json.load(file)

    if not isinstance(raw_questions, list):
        raise ValueError("Datensatzformat ungültig: Erwartet wird ein JSON-Array.")

    normalized_questions = [normalize_question(item, idx) for idx, item in enumerate(raw_questions)]
    unique_ids = {q["id"] for q in normalized_questions}
    if len(unique_ids) < MAX_ROUNDS:
        raise ValueError("Zu wenige eindeutige Fragen für 5 Runden vorhanden.")
    return normalized_questions


def init_state() -> None:
    defaults = {
        "page": "signup",
        "round_number": 1,
        "max_rounds": MAX_ROUNDS,
        "players": [],
        "pending_players": [],
        "used_question_ids": [],
        "current_player_index": 0,
        "current_question": None,
        "game_started": False,
        "game_finished": False,
        "reveal_active": False,
        "last_result": None,
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


def clean_name(name: str) -> str:
    return " ".join(name.strip().split())


def all_player_names() -> set[str]:
    registered = {player["name"].lower() for player in st.session_state.players}
    queued = {player["name"].lower() for player in st.session_state.pending_players}
    return registered | queued


def add_player(name: str, late_join: bool = False) -> tuple[bool, str]:
    clean = clean_name(name)
    if not clean:
        return False, "Bitte einen Vornamen eingeben."
    if " " in clean:
        return False, "Bitte nur den Vornamen verwenden."
    if clean.lower() in all_player_names():
        return False, f"'{clean}' ist bereits dabei."

    player = {"name": clean, "score": 0, "turns_played": 0}
    if late_join and st.session_state.game_started:
        st.session_state.pending_players.append(player)
        return True, f"{clean} wurde hinzugefügt und ist ab der nächsten Runde in der Rotation."

    st.session_state.players.append(player)
    return True, f"{clean} ist jetzt dabei."


def sorted_ranking() -> list[dict]:
    players = sorted(
        st.session_state.players,
        key=lambda p: (-p["score"], -p["turns_played"], p["name"].lower()),
    )
    ranking = []
    previous_score = None
    previous_rank = 0
    for idx, player in enumerate(players, start=1):
        rank = previous_rank if previous_score == player["score"] else idx
        ranking.append({"Rang": rank, "Name": player["name"], "Punkte": player["score"]})
        previous_score = player["score"]
        previous_rank = rank
    return ranking


def pick_next_question() -> dict:
    all_questions = load_questions()
    used = set(st.session_state.used_question_ids)
    available = [q for q in all_questions if q["id"] not in used]
    if not available:
        raise RuntimeError("Keine ungenutzten Fragen mehr verfügbar.")
    question = random.choice(available)
    st.session_state.current_question = question
    st.session_state.used_question_ids.append(question["id"])
    return question


def ensure_question() -> None:
    if st.session_state.current_question is None:
        pick_next_question()


def current_player() -> dict:
    if not st.session_state.players:
        raise RuntimeError("Keine Spieler vorhanden.")
    idx = st.session_state.current_player_index % len(st.session_state.players)
    return st.session_state.players[idx]


def evaluate_answer(choice: str) -> None:
    question = st.session_state.current_question
    is_higher = question["right_value"] >= question["left_value"]
    is_correct = (choice == "Höher" and is_higher) or (choice == "Niedriger" and not is_higher)

    player = current_player()
    if is_correct:
        player["score"] += 1
    player["turns_played"] += 1

    st.session_state.last_result = {
        "player": player["name"],
        "choice": choice,
        "correct": is_correct,
        "left_value": question["left_value"],
        "right_value": question["right_value"],
    }
    st.session_state.reveal_active = True


def apply_pending_players() -> None:
    if st.session_state.pending_players:
        st.session_state.players.extend(st.session_state.pending_players)
        st.session_state.pending_players = []


def advance_round() -> None:
    st.session_state.reveal_active = False
    st.session_state.current_question = None
    st.session_state.last_result = None

    if st.session_state.round_number >= st.session_state.max_rounds:
        st.session_state.game_finished = True
        st.session_state.page = "final"
        return

    st.session_state.round_number += 1
    apply_pending_players()
    if st.session_state.players:
        st.session_state.current_player_index = (
            st.session_state.current_player_index + 1
        ) % len(st.session_state.players)
    st.session_state.page = "game"


def start_game() -> None:
    if not st.session_state.players:
        st.warning("Mindestens eine Person muss beitreten.")
        return
    st.session_state.game_started = True
    st.session_state.page = "game"
    st.session_state.round_number = 1
    st.session_state.current_player_index = 0
    st.session_state.used_question_ids = []
    st.session_state.current_question = None
    st.session_state.reveal_active = False
    st.session_state.last_result = None
    st.session_state.game_finished = False


def restart_game() -> None:
    st.session_state.page = "signup"
    st.session_state.round_number = 1
    st.session_state.current_player_index = 0
    st.session_state.used_question_ids = []
    st.session_state.current_question = None
    st.session_state.reveal_active = False
    st.session_state.last_result = None
    st.session_state.game_started = False
    st.session_state.game_finished = False
    st.session_state.pending_players = []
    for player in st.session_state.players:
        player["score"] = 0
        player["turns_played"] = 0


def render_late_join() -> None:
    with st.expander("Late Join", expanded=False):
        st.caption("Neue Spieler starten mit 0 Punkten und sind ab der nächsten Runde aktiv.")
        new_name = st.text_input(
            "Vorname (Late Join)",
            key=f"late_join_input_{st.session_state.page}",
            placeholder="z. B. Lea",
            label_visibility="collapsed",
        )
        if st.button("Spieler hinzufügen", key=f"late_join_btn_{st.session_state.page}"):
            success, message = add_player(new_name, late_join=st.session_state.game_started)
            if success:
                st.success(message)
            else:
                st.error(message)

        if st.session_state.pending_players:
            queued = ", ".join(player["name"] for player in st.session_state.pending_players)
            st.info(f"Ab nächster Runde aktiv: {queued}")


def render_players_list() -> None:
    if st.session_state.players:
        chips = "".join(f"<span class='pill'>{player['name']}</span>" for player in st.session_state.players)
        st.markdown(chips, unsafe_allow_html=True)
    else:
        st.markdown(
            "<div class='empty-state'>Noch keine Spieler in der Lobby.<br>Starte mit deinem Vornamen.</div>",
            unsafe_allow_html=True,
        )


def render_ranking_list(ranking: list[dict], top_highlight_count: int = 1) -> None:
    if not ranking:
        return
    rows = []
    for idx, entry in enumerate(ranking):
        row_class = "rank-row top" if idx < top_highlight_count else "rank-row"
        rows.append(
            f"<div class='{row_class}'><div>#{entry['Rang']}</div><div>{entry['Name']}</div><div>{entry['Punkte']} P</div></div>"
        )
    st.markdown(f"<div class='rank-list'>{''.join(rows)}</div>", unsafe_allow_html=True)


def render_signup() -> None:
    st.markdown("<div class='hero'><h1>Higher or Lower – NEONEX Edition</h1></div>", unsafe_allow_html=True)
    st.markdown(
        "<p class='subtle' style='text-align:center;'>Trefft intuitive Entscheidungen, sammelt Punkte und holt euch den 5-Runden-Sieg.</p>",
        unsafe_allow_html=True,
    )
    st.markdown(
        "<div style='text-align:center; margin-bottom:1.5rem;'><span class='hero-badge'>5 Runden · Deutsche Fragen · Intuition & Glück</span></div>",
        unsafe_allow_html=True,
    )

    left_col, right_col = st.columns([1.15, 1], gap="large")
    with left_col:
        st.markdown("<div class='lobby-card'>", unsafe_allow_html=True)
        st.markdown("<div class='card-head'>Beitreten</div>", unsafe_allow_html=True)
        first_name = st.text_input("Vorname", placeholder="z. B. Felix", key="signup_name")
        if st.button("Beitreten", key="signup_join_btn"):
            success, message = add_player(first_name)
            if success:
                st.success(message)
            else:
                st.error(message)
        st.markdown("<p class='mini-note'>Nur Vorname, keine Duplikate.</p>", unsafe_allow_html=True)
        st.markdown("</div>", unsafe_allow_html=True)

    with right_col:
        st.markdown("<div class='lobby-card'>", unsafe_allow_html=True)
        st.markdown("<div class='card-head'>Teilnehmer</div>", unsafe_allow_html=True)
        render_players_list()
        st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("<div class='surface' style='margin-top:1rem;'>", unsafe_allow_html=True)
    can_start = len(st.session_state.players) > 0
    st.markdown("<div class='primary-cta'>", unsafe_allow_html=True)
    st.button("Spiel starten", on_click=start_game, disabled=not can_start, key="start_btn")
    st.markdown("</div>", unsafe_allow_html=True)
    hint = "Mindestens 1 Teilnehmer wird benötigt." if not can_start else "Alle bereit? Das Spiel startet direkt mit Runde 1."
    st.markdown(f"<p class='mini-note'>{hint}</p>", unsafe_allow_html=True)
    st.markdown("</div>", unsafe_allow_html=True)


def render_question_card(label: str, value: str | int) -> str:
    return f"""
    <div class="neo-card">
        <div class="card-label">{label}</div>
        <div class="big-value">{value}</div>
    </div>
    """


def render_game() -> None:
    ensure_question()
    question = st.session_state.current_question
    active_player = current_player()
    ranking = sorted_ranking()
    leader_snapshot = f"{ranking[0]['Name']} ({ranking[0]['Punkte']} P)" if ranking else "-"

    st.markdown(
        "<div class='top-bar'>"
        f"<div class='top-item'><div class='k'>Runde</div><div class='v'>{st.session_state.round_number} / {st.session_state.max_rounds}</div></div>"
        f"<div class='top-item'><div class='k'>Am Zug</div><div class='v'>{active_player['name']}</div></div>"
        f"<div class='top-item'><div class='k'>Aktueller Leader</div><div class='v'>{leader_snapshot}</div></div>"
        "</div>",
        unsafe_allow_html=True,
    )

    st.markdown("<div class='play-stage'>", unsafe_allow_html=True)
    left, center, right = st.columns([1, 0.18, 1], gap="medium")
    with left:
        st.markdown(
            render_question_card(question["left_label"], f"{question['left_value']}"),
            unsafe_allow_html=True,
        )
    with center:
        st.markdown("<div class='vs'>VS</div>", unsafe_allow_html=True)
    with right:
        right_value = question["right_value"] if st.session_state.reveal_active else "???"
        st.markdown(
            render_question_card(question["right_label"], right_value),
            unsafe_allow_html=True,
        )
    st.markdown("</div>", unsafe_allow_html=True)

    if not st.session_state.reveal_active:
        st.markdown("<div class='action-row'>", unsafe_allow_html=True)
        guess_left, guess_right = st.columns(2, gap="medium")
        with guess_left:
            if st.button("Höher", key=f"guess_high_{st.session_state.round_number}"):
                evaluate_answer("Höher")
                st.rerun()
        with guess_right:
            if st.button("Niedriger", key=f"guess_low_{st.session_state.round_number}"):
                evaluate_answer("Niedriger")
                st.rerun()
        st.markdown("</div>", unsafe_allow_html=True)
    else:
        result = st.session_state.last_result
        if result["correct"]:
            st.success(
                f"Stark, {result['player']}! {result['choice']} war korrekt. +1 Punkt."
            )
        else:
            st.error(
                f"Knapp daneben, {result['player']}. {result['choice']} war leider falsch."
            )
        st.markdown("<div class='primary-cta'>", unsafe_allow_html=True)
        if st.button("Zum Zwischenranking", key=f"to_leaderboard_{st.session_state.round_number}"):
            st.session_state.page = "leaderboard"
            st.rerun()
        st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("---")
    render_late_join()


def render_leaderboard() -> None:
    st.markdown(f"<div class='hero'><h1>Zwischenstand nach Runde {st.session_state.round_number}</h1></div>", unsafe_allow_html=True)
    st.markdown(
        f"<p class='subtle' style='text-align:center;'>Noch {st.session_state.max_rounds - st.session_state.round_number} Runde(n) bis zum Finale.</p>",
        unsafe_allow_html=True,
    )

    ranking = sorted_ranking()
    leader_name = ranking[0]["Name"] if ranking else "-"
    leader_points = ranking[0]["Punkte"] if ranking else 0
    st.markdown(
        f"<div class='status-box leader'><strong>Aktueller Leader: {leader_name}</strong>"
        f"<br>{leader_points} Punkte</div>",
        unsafe_allow_html=True,
    )

    render_ranking_list(ranking, top_highlight_count=min(3, len(ranking)))

    next_label = "Finale anzeigen" if st.session_state.round_number >= st.session_state.max_rounds else "Nächste Runde"
    st.markdown("<div class='primary-cta' style='margin-top:1rem;'>", unsafe_allow_html=True)
    if st.button(next_label, key=f"next_round_btn_{st.session_state.round_number}"):
        advance_round()
        st.rerun()
    st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("---")
    render_late_join()


def render_final() -> None:
    st.markdown("<div class='hero'><h1>Finale – Higher or Lower</h1></div>", unsafe_allow_html=True)
    st.markdown(
        "<p class='subtle' style='text-align:center;'>Beste Intuition bei NEONEX</p>",
        unsafe_allow_html=True,
    )

    ranking = sorted_ranking()
    if ranking:
        top_score = ranking[0]["Punkte"]
        winners = [entry["Name"] for entry in ranking if entry["Punkte"] == top_score]
        winner_text = ", ".join(winners)
        st.markdown(
            f"<div class='status-box leader'><strong>Gewinner: {winner_text}</strong>"
            f"<br>mit {top_score} Punkten nach {st.session_state.max_rounds} Runden</div>",
            unsafe_allow_html=True,
        )

    render_ranking_list(ranking, top_highlight_count=1)

    left, right = st.columns(2)
    with left:
        st.markdown("<div class='primary-cta'>", unsafe_allow_html=True)
        if st.button("Neues Spiel (gleiche Teilnehmer)", key="restart_btn"):
            restart_game()
            st.rerun()
        st.markdown("</div>", unsafe_allow_html=True)
    with right:
        st.markdown("<div class='surface' style='height:100%;'>", unsafe_allow_html=True)
        st.markdown("<p class='subtle' style='margin-bottom:0;'>Danke fürs Mitspielen.</p>", unsafe_allow_html=True)
        st.caption("Late Join ist nach Spielende nicht mehr nötig.")
        st.markdown("</div>", unsafe_allow_html=True)


def main() -> None:
    init_state()
    try:
        load_questions()
    except Exception as exc:
        st.error(f"Datensatz konnte nicht geladen werden: {exc}")
        st.stop()

    page = st.session_state.page
    if page == "signup":
        render_signup()
    elif page == "game":
        render_game()
    elif page == "leaderboard":
        render_leaderboard()
    elif page == "final":
        render_final()
    else:
        st.session_state.page = "signup"
        st.rerun()


if __name__ == "__main__":
    main()
