const buttons = document.querySelectorAll(".cell");
const statusText = document.querySelector("#status");
const restartButton = document.querySelector("#restart");

let cells = Array(9).fill("");
let currentPlayer = "X";
let gameOver = false;

const winningLines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function getWinningLine() {
  return winningLines.find(([a, b, c]) =>
    cells[a] !== "" &&
    cells[a] === cells[b] &&
    cells[a] === cells[c]
  );
}

function playTurn(index) {
  if (gameOver || cells[index] !== "") return;

  cells[index] = currentPlayer;
  buttons[index].textContent = currentPlayer;
  buttons[index].setAttribute(
    "aria-label", `Cell ${index + 1}, ${currentPlayer}`
  );

  const winningLine = getWinningLine();
  if (winningLine) {
    gameOver = true;
    statusText.textContent = `Player ${currentPlayer} wins!`;
    winningLine.forEach(index =>
      buttons[index].classList.add("winner")
    );
    return;
  }

  if (cells.every(cell => cell !== "")) {
    gameOver = true;
    statusText.textContent = "It's a draw!";
    return;
  }

  currentPlayer = currentPlayer === "X" ? "O" : "X";
  statusText.textContent = `Player ${currentPlayer}'s turn`;
}

function restartGame() {
  cells = Array(9).fill("");
  currentPlayer = "X";
  gameOver = false;
  statusText.textContent = "Player X's turn";
  buttons.forEach((button, index) => {
    button.textContent = "";
    button.classList.remove("winner");
    button.setAttribute("aria-label", `Cell ${index + 1}, empty`);
  });
  buttons[0].focus();
}

buttons.forEach((button, index) => {
  button.addEventListener("click", () => playTurn(index));
});
restartButton.addEventListener("click", restartGame);
