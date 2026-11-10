// Line colors, in order: black, purple, green, orange, light purple
const LINE_COLORS = ["#000000", "#6a1b9a", "#2e7d32", "#ef6c00", "#b388eb"];
const X_COLOR = "#d62828";
const O_COLOR = "#1f5fd6";
const RESULT_TEXT = {
  human_wins: "You win",
  agent_wins: "You lose",
  draw: "It's a draw",
};

let board = ".........";   // 9 squares, row by row: X = agent, O = human, . = empty
let gameActive = false;    // true while a game is in progress
let waiting = false;       // true while waiting for the server
let gameId = 0;            // changes on New Game, so old answers are ignored
let colorIndex = 0;
let retryOpening = false;  // agent's first move failed: try again after Close

const svgNS = "http://www.w3.org/2000/svg";
const statusEl = document.getElementById("status");
const boardSvg = document.getElementById("board");
const cellsGroup = document.getElementById("cells");
const marksGroup = document.getElementById("marks");
const winLine = document.getElementById("win-line");
const resultBox = document.getElementById("result-box");
const page = document.getElementById("page");
const errorOverlay = document.getElementById("error-overlay");
const errorMessage = document.getElementById("error-message");

// ---------- Drawing ----------
function center(square) {
  return { x: (square % 3) * 100 + 50, y: Math.floor(square / 3) * 100 + 50 };
}

function makeCells() {
  for (let i = 0; i < 9; i++) {
    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", (i % 3) * 100);
    rect.setAttribute("y", Math.floor(i / 3) * 100);
    rect.setAttribute("width", 100);
    rect.setAttribute("height", 100);
    rect.classList.add("cell");
    rect.addEventListener("click", () => onSquareClick(i));
    cellsGroup.appendChild(rect);
  }
}

function drawLine(group, x1, y1, x2, y2, color, width) {
  const line = document.createElementNS(svgNS, "line");
  line.setAttribute("x1", x1); line.setAttribute("y1", y1);
  line.setAttribute("x2", x2); line.setAttribute("y2", y2);
  line.setAttribute("stroke", color);
  line.setAttribute("stroke-width", width);
  line.setAttribute("stroke-linecap", "round");
  group.appendChild(line);
}

function render() {
  marksGroup.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const c = center(i);
    if (board[i] === "X") {
      drawLine(marksGroup, c.x - 28, c.y - 28, c.x + 28, c.y + 28, X_COLOR, 10);
      drawLine(marksGroup, c.x + 28, c.y - 28, c.x - 28, c.y + 28, X_COLOR, 10);
    } else if (board[i] === "O") {
      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("cx", c.x);
      circle.setAttribute("cy", c.y);
      circle.setAttribute("r", 30);
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", O_COLOR);
      circle.setAttribute("stroke-width", 10);
      marksGroup.appendChild(circle);
    }
  }
  // A square can be clicked only on the human's turn, and only if it's empty
  const cells = cellsGroup.children;
  for (let i = 0; i < 9; i++) {
    const canClick = gameActive && !waiting && board[i] === ".";
    cells[i].classList.toggle("clickable", canClick);
  }
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = kind;   // "info", "human", "agent" or ""
}

// ---------- Game flow ----------
function newGame() {
  gameId++;
  board = ".........";
  gameActive = true;
  waiting = false;
  retryOpening = false;
  boardSvg.classList.remove("blurred");
  resultBox.hidden = true;
  winLine.style.display = "none";

  const humanStarts = Math.random() < 0.5;
  if (humanStarts) {
    setStatus("Your turn", "human");
    render();
  } else {
    requestMove(board, null);   // the agent makes the first move
  }
}

function onSquareClick(square) {
  if (!gameActive || waiting || board[square] !== ".") return;   // does nothing
  const before = board;
  board = board.slice(0, square) + "O" + board.slice(square + 1);
  requestMove(board, before);
}

// Send the board to the server and show the agent's answer.
// fallbackBoard: the board to go back to if there is an error (null = agent's first move)
async function requestMove(sentBoard, fallbackBoard) {
  const myGame = gameId;
  waiting = true;
  setStatus("Opponent's turn", "agent");
  render();

  let response;
  try {
    response = await fetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        board: sentBoard,
        agent: document.getElementById("agent-type").value,
      }),
    });
  } catch (e) {
    if (myGame !== gameId) return;   // a New Game was started meanwhile
    handleError("Can't reach the server. Check that Flask is running.", fallbackBoard);
    return;
  }

  let data = null;
  try { data = await response.json(); } catch (e) { data = null; }
  if (myGame !== gameId) return;

  if (!response.ok || data === null) {
    const msg = data && data.error ? data.error : "Server error (status " + response.status + ")";
    handleError(msg, fallbackBoard);
    return;
  }

  board = data.board;
  waiting = false;
  if (data.status === "playing") {
    setStatus("Your turn", "human");
    render();
  } else {
    endGame(data.status, data.winning_line);
  }
}

function endGame(status, winningLine) {
  gameActive = false;
  waiting = false;
  setStatus("", "");
  render();
  if (winningLine) {
    // Draw a line over the 3 winning marks, a little longer than the marks
    const a = center(winningLine[0]);
    const b = center(winningLine[2]);
    const dx = (b.x - a.x) / 200 * 35;
    const dy = (b.y - a.y) / 200 * 35;
    winLine.setAttribute("x1", a.x - dx); winLine.setAttribute("y1", a.y - dy);
    winLine.setAttribute("x2", b.x + dx); winLine.setAttribute("y2", b.y + dy);
    winLine.style.display = "";
  }
  boardSvg.classList.add("blurred");
  resultBox.textContent = RESULT_TEXT[status];
  resultBox.hidden = false;
}

// ---------- Errors ----------
function handleError(message, fallbackBoard) {
  waiting = false;
  if (fallbackBoard === null) {
    retryOpening = true;          // try the agent's first move again after Close
  } else {
    board = fallbackBoard;        // take back the O so you can try again
    setStatus("Your turn", "human");
  }
  render();
  errorMessage.textContent = message;
  page.classList.add("blurred");
  errorOverlay.hidden = false;
}

function closeError() {
  errorOverlay.hidden = true;
  page.classList.remove("blurred");
  if (retryOpening && gameActive) {
    retryOpening = false;
    requestMove(board, null);
  }
}

// ---------- Controls ----------
function changeColor() {
  colorIndex = (colorIndex + 1) % LINE_COLORS.length;
  document.getElementById("grid-lines").setAttribute("stroke", LINE_COLORS[colorIndex]);
}

document.getElementById("new-game").addEventListener("click", newGame);
document.getElementById("change-color").addEventListener("click", changeColor);
document.getElementById("error-close").addEventListener("click", closeError);

makeCells();
render();
