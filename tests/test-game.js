const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const path = require('path');
const code = fs.readFileSync(path.join(__dirname, '../game/script.js'), 'utf8');
function element() {
  return {textContent:'', attrs:{}, listeners:{}, classes:new Set(), focused:false,
    setAttribute(k,v){this.attrs[k]=v}, addEventListener(k,f){this.listeners[k]=f},
    focus(){this.focused=true},
    get classList(){const s=this.classes;return {add:x=>s.add(x),remove:x=>s.delete(x)}}};
}
function setup() {
  const buttons=Array.from({length:9},element), status=element(), restart=element();
  status.textContent="Player X's turn";
  const ctx=vm.createContext({document:{querySelectorAll:()=>buttons,querySelector:s=>s==='#status'?status:restart}});
  vm.runInContext(code,ctx);
  const state=()=>JSON.parse(vm.runInContext('JSON.stringify({cells,currentPlayer,gameOver})',ctx));
  const snap=()=>({...state(),status:status.textContent,winners:buttons.flatMap((b,i)=>b.classes.has('winner')?[i]:[])});
  const click=i=>buttons[i].listeners.click();
  return {buttons,status,restart,ctx,state,snap,click};
}
const traces={};
for(const [name,moves,expected] of [
  ['x-win',[0,3,1,4,2],'Player X wins!'],
  ['o-win',[0,3,1,4,8,5],'Player O wins!'],
  ['draw',[0,1,2,4,3,5,7,6,8],"It's a draw!"]
]) {
  const g=setup();traces[name]=[g.snap()];
  for(const move of moves){g.click(move);traces[name].push({...g.snap(),move})}
  assert.equal(g.status.textContent,expected);
  assert.equal(g.state().gameOver,true);
  const before=g.snap();g.click(7);assert.deepEqual(g.snap(),before);
  g.restart.listeners.click();assert.equal(g.state().gameOver,false);
  assert.deepEqual(g.state().cells,Array(9).fill(''));assert.equal(g.state().currentPlayer,'X');
  assert.equal(g.buttons[0].focused,true);assert.equal(g.snap().winners.length,0);
  assert.equal(g.buttons[0].attrs['aria-label'],'Cell 1, empty');
}
let g=setup();g.click(0);const before=g.snap();g.click(0);assert.deepEqual(g.snap(),before);
traces['blocked']=[{...before,move:0},{...g.snap(),move:0}];
assert.equal(g.buttons[0].attrs['aria-label'],'Cell 1, X');
const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
for (const line of lines) for (const player of ['X','O']) {
  g=setup(); const cells=Array(9).fill('');line.forEach(i=>cells[i]=player);
  vm.runInContext(`cells=${JSON.stringify(cells)}`,g.ctx);
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(getWinningLine())',g.ctx)),line);
}
g=setup();assert.equal(vm.runInContext('getWinningLine()',g.ctx),undefined);
// A final-square win must win, rather than be misreported as a draw.
g=setup();[0,1,2,3,4,5,7,6,8].forEach(g.click);assert.equal(g.status.textContent,'Player X wins!');
// Check opening sequences through the actual event callbacks.
let games=0,xWins=0,oWins=0,draws=0;
function walk(moves) {
 const game=setup();moves.forEach(game.click);const s=game.snap();
 const oracle=lines.find(([a,b,c])=>s.cells[a]!=='' && s.cells[a]===s.cells[b] && s.cells[a]===s.cells[c]);
 if(oracle){assert.equal(s.status,`Player ${s.cells[oracle[0]]} wins!`);assert.equal(s.gameOver,true);games++;if(s.cells[oracle[0]]==='X')xWins++;else oWins++;return;}
 if(s.cells.every(Boolean)){assert.equal(s.status,"It's a draw!");assert.equal(s.gameOver,true);games++;draws++;return;}
 assert.equal(s.gameOver,false);
 // The independent exhaustive-game.js covers the complete reachable state space.
}
// Check all one- and two-move starts through the actual DOM event callbacks.
for(let a=0;a<9;a++){walk([a]);for(let b=0;b<9;b++)if(a!==b)walk([a,b]);}
console.log('PASS: X win, O win, draw, occupied-cell guard, end lock, restart, focus, labels');
console.log('PASS: all 8 winning lines for both players, empty-board check, final-square win');
console.log('PASS: all 81 one-/two-move opening sequences via actual event handlers');
console.log('Browser not used: logic/event tests run against a small DOM test double.');
