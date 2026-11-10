import random
import json
import os
from flask import Flask, render_template, request

app = Flask(__name__)

# The 8 ways to win: 3 rows, 3 columns, 2 diagonals (square indexes 0-8)
WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
]


def is_valid_board(board):
    """9 characters of X, O and '.', and it must be the agent's (X) turn."""
    if not isinstance(board, str) or len(board) != 9:
        return False
    if any(ch not in "XO." for ch in board):
        return False
    # Agent started: X == O.  Human started: O == X + 1.
    return board.count("O") - board.count("X") in (0, 1)


def check_board(board):
    """Return (status, winning_line) for a board."""
    for line in WIN_LINES:
        a, b, c = line
        if board[a] != "." and board[a] == board[b] == board[c]:
            return ("agent_wins" if board[a] == "X" else "human_wins"), line
    if "." not in board:
        return "draw", None
    return "playing", None


# ---------------- Agents ----------------
def random_agent(board):
    """Pick a random empty square."""
    empty = [i for i, ch in enumerate(board) if ch == "."]
    return random.choice(empty)


# Load the Q-table trained in Colab (it must be next to TTT.py)
QTABLE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "qtable.json")
with open(QTABLE_PATH) as f:
    Q_TABLE = json.load(f)


def qtable_agent(board):
    """Play the empty square with the highest Q. Random if the board was never seen."""
    empty = [i for i, ch in enumerate(board) if ch == "."]
    q = Q_TABLE.get(board)
    if q is None:
        return random.choice(empty)
    best = max(q[i] for i in empty)
    return random.choice([i for i in empty if q[i] == best])


AGENTS = {
    "random": random_agent,
    "qtable": qtable_agent,
}


# ---------------- Routes ----------------
@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/move", methods=["POST"])
def api_move():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return {"error": "Send JSON with board and agent"}, 400
    for field in ("board", "agent"):
        if field not in data:
            return {"error": f"Missing field: {field}"}, 400

    board = data["board"]
    agent_id = data["agent"]

    if not is_valid_board(board):
        return {"error": "Invalid board: send 9 characters of X, O and ."}, 400
    if agent_id not in AGENTS:
        return {"error": f"Unknown agent: '{agent_id}'"}, 400

    # The human's move may have already ended the game
    status, line = check_board(board)
    if status != "playing":
        return {"board": board, "agent_move": None,
                "status": status, "winning_line": line}

    move = AGENTS[agent_id](board)
    board = board[:move] + "X" + board[move + 1:]
    status, line = check_board(board)
    return {"board": board, "agent_move": move,
            "status": status, "winning_line": line}


if __name__ == "__main__":
    app.run(debug=True)
