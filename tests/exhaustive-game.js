// Independent static and exhaustive state QA. Uses a DOM test double, not a browser.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../game/script.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../game/index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../game/style.css'), 'utf8');
function element(label = '') {
  const e = {textContent: '', attributes: {'aria-label': label}, classes: new Set(), events: {}, focusCalls: 0,
    setAttribute(k, v) { this.attributes[k] = String(v); },
    addEventListener(k, f) { this.events[k] = f; },
    focus() { this.focusCalls++; }};
  e.classList = {add: name => e.classes.add(name), remove: name => e.classes.delete(name)};
  return e;
}
const buttons = Array.from({length:9}, (_, i) => element(`Cell ${i + 1}, empty`));
const status = element(); status.textContent = "Player X's turn";
const restart = element();
const context = vm.createContext({document: {
  querySelectorAll: selector => { assert.equal(selector, '.cell'); return buttons; },
  querySelector: selector => { assert.ok(['#status', '#restart'].includes(selector)); return selector === '#status' ? status : restart; }
}});
vm.runInContext(source, context);
const readState = vm.runInContext('() => JSON.stringify({cells, currentPlayer, gameOver})', context);
const state = () => JSON.parse(readState());
const snapshot = () => JSON.stringify({state: state(), status: status.textContent,
  buttons: buttons.map(b => ({text:b.textContent, attributes:b.attributes, classes:[...b.classes]}))});
const click = index => buttons[index].events.click();
const reset = () => restart.events.click();
// Bit masks provide an independent win oracle, not a copy of getWinningLine.
const masks = [0b000000111, 0b000111000, 0b111000000,
  0b001001001, 0b010010010, 0b100100100, 0b100010001, 0b001010100];
function outcome(board) {
  for (const player of ['X','O']) {
    let bits = 0;
    board.forEach((v,i) => { if (v === player) bits |= 1 << i; });
    const wins = masks.filter(mask => (bits & mask) === mask);
    if (wins.length) return {player, wins};
  }
  return board.every(Boolean) ? {draw: true} : null;
}
function verifyReset() {
  assert.deepEqual(state(), {cells:Array(9).fill(''),currentPlayer:'X',gameOver:false});
  assert.equal(status.textContent, "Player X's turn");
  buttons.forEach((b,i) => {
    assert.equal(b.textContent, '');
    assert.equal(b.attributes['aria-label'], `Cell ${i+1}, empty`);
    assert.equal(b.classes.size, 0);
  });
}
const initial = state();
assert.deepEqual(initial, {cells:Array(9).fill(''),currentPlayer:'X',gameOver:false});
reset(); verifyReset(); reset(); verifyReset();
const visited = new Set();
const queue = [{board:Array(9).fill(''), moves:[]}];
let checked = 0, edges = 0, guards = 0, terminal = 0, xWins = 0, oWins = 0, draws = 0;
const winningCoverage = {X:new Set(), O:new Set()};
for (let cursor = 0; cursor < queue.length; cursor++) {
  const {board, moves} = queue[cursor];
  const key = board.map(x => x || '-').join('');
  if (visited.has(key)) continue;
  visited.add(key);
  reset(); verifyReset();
  moves.forEach(click);
  const actual = state();
  assert.deepEqual(actual.cells, board, `Board for ${key}`);
  const result = outcome(board);
  const next = moves.length % 2 === 0 ? 'X' : 'O';
  assert.equal(actual.gameOver, !!result, `Finished state for ${key}`);
  assert.equal(actual.currentPlayer, result ? (next === 'X' ? 'O' : 'X') : next);
  assert.equal(status.textContent, result?.player ? `Player ${result.player} wins!` : result?.draw ? "It's a draw!" : `Player ${next}'s turn`);
  buttons.forEach((b,i) => {
    assert.equal(b.textContent, board[i]);
    assert.equal(b.attributes['aria-label'], `Cell ${i+1}, ${board[i] || 'empty'}`);
  });
  const winnerBits = buttons.reduce((bits,b,i) => bits | (b.classes.has('winner') ? 1 << i : 0), 0);
  if (result?.player) {
    assert.ok(result.wins.includes(winnerBits), `Winning highlight for ${key}`);
    result.wins.forEach(mask => winningCoverage[result.player].add(mask));
  } else assert.equal(winnerBits, 0);
  const before = snapshot();
  board.forEach((value,i) => {
    if (value || result) {
      click(i); guards++;
      assert.equal(snapshot(), before, `Guard at cell ${i} for ${key}`);
    }
  });
  checked++;
  if (result) {
    terminal++;
    if (result.player === 'X') xWins++;
    else if (result.player === 'O') oWins++;
    else draws++;
  } else {
    board.forEach((value,i) => {
      if (value) return;
      const copy = [...board]; copy[i] = next;
      click(i);
      const after = state(), edgeResult = outcome(copy);
      assert.deepEqual(after.cells, copy, `Transition ${key} -> ${i}`);
      assert.equal(after.gameOver, !!edgeResult);
      assert.equal(after.currentPlayer, edgeResult ? next : (next === 'X' ? 'O' : 'X'));
      assert.equal(status.textContent, edgeResult?.player ? `Player ${edgeResult.player} wins!` : edgeResult?.draw ? "It's a draw!" : `Player ${next === 'X' ? 'O' : 'X'}'s turn`);
      assert.equal(buttons[i].textContent, next);
      assert.equal(buttons[i].attributes['aria-label'], `Cell ${i+1}, ${next}`);
      const edgeHighlights = buttons.reduce((bits,b,j) => bits | (b.classes.has('winner') ? 1 << j : 0), 0);
      if (edgeResult?.player) assert.ok(edgeResult.wins.includes(edgeHighlights));
      else assert.equal(edgeHighlights, 0);
      reset(); moves.forEach(click);
      assert.equal(snapshot(), before, 'Restored base board for next transition');
      queue.push({board:copy, moves:[...moves,i]}); edges++;
    });
  }
}
reset(); verifyReset();
assert.equal(checked, 5478);
assert.equal(terminal, 958);
assert.equal(xWins, 626); assert.equal(oWins, 316); assert.equal(draws, 16);
assert.equal(winningCoverage.X.size, 8); assert.equal(winningCoverage.O.size, 8);
assert.ok(buttons[0].focusCalls >= checked + 3);
assert.equal((html.match(/class="cell"/g) || []).length, 9);
assert.ok(/<html lang="en">/.test(html));
assert.ok(/<script src="script\.js" defer><\/script>/.test(html));
assert.ok(/id="status"[^>]*role="status"[^>]*aria-live="polite"/.test(html));
assert.ok(/button:focus-visible\s*\{/.test(css));
assert.ok(/id="board"[^>]*role="group"[^>]*aria-label="Tic-tac-toe board"/.test(html));
function luminance(hex) {
  const rgb = hex.match(/[0-9a-f]{2}/gi).map(v => parseInt(v,16)/255).map(v => v <= 0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4);
  return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
}
function contrast(a,b) { const x=luminance(a), y=luminance(b); return ((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2); }
console.log(`PASS: ${checked} unique reachable states and ${edges} legal state transitions; ${guards} occupied/end-state guard attempts.`);
console.log(`PASS: ${terminal} terminal states (${xWins} X wins, ${oWins} O wins, ${draws} draws); all 8 lines reachable for each player.`);
console.log('PASS: correct status, active player, rendered symbols, labels, winner highlights, complete restart, repeated restart, restart focus.');
console.log('PASS: static HTML cell count, deferred script, document language, live status, visible keyboard focus styling.');
// Read the actual simple CSS declarations rather than duplicating design colors.
function cssColor(selector, property) {
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(match => match[1].trim() === selector);
  assert.ok(rule, `Missing CSS rule: ${selector}`);
  const declaration = rule[2].split(';').map(value => value.trim()).find(value => value.split(':')[0].trim() === property);
  assert.ok(declaration, `Missing CSS property: ${selector} ${property}`);
  const hex = declaration.match(/#[0-9a-f]{6}\b/i)?.[0];
  assert.ok(hex, `Expected explicit six-digit hex color for ${selector} ${property}`);
  return hex;
}
const pageBackground = cssColor('body', 'background');
const cellBackground = cssColor('.cell', 'background');
const cellBorder = cssColor('.cell', 'border');
const borderVsPage = contrast(cellBorder, pageBackground);
const borderVsCell = contrast(cellBorder, cellBackground);
assert.ok(Number(borderVsPage) >= 3, 'Cell boundary should have at least 3:1 contrast against page');
assert.ok(Number(borderVsCell) >= 3, 'Cell boundary should have at least 3:1 contrast against cell');
console.log(`CONTRAST (current CSS): cell text ${contrast(cssColor('.cell','color'),cellBackground)}:1; hint ${contrast(cssColor('.hint','color'),pageBackground)}:1; status ${contrast(cssColor('#status','color'),pageBackground)}:1; restart ${contrast(cssColor('#restart','color'),cssColor('#restart','background'))}:1.`);
console.log(`PASS: current cell border ${cellBorder} has ${borderVsPage}:1 contrast against page and ${borderVsCell}:1 against cell (3:1 target); board has a named group role.`);
console.log('CAVEAT: Node VM + DOM test double and static source checks only; no browser, rendered-layout, real keyboard, or screen-reader testing performed.');
