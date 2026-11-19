import test from 'node:test';
import assert from 'node:assert/strict';
import * as gomoku from '../street-gomoku.js';
import {playTurn} from '../street-gomoku.js';

const at=(row,col)=>row*9+col;
const emptyBoard=()=>Array(81).fill(0);

// 无五连的满盘图样：横向逐格交替，纵向与斜向最多两连。
// 40 号点属于黑（1），把它挖空后正好可以验证“最后一手和棋”。
function drawBoard(){
 const board=emptyBoard();
 for(let row=0;row<9;row++){
  for(let col=0;col<9;col++){
   board[at(row,col)]=((row+2*col)%4<2)?1:2;
  }
 }
 return board;
}

test('仅导出 playTurn；空棋盘黑下中心后白在最近的空点回一手', () => {
 assert.deepEqual(Object.keys(gomoku),['playTurn']);
 const input=emptyBoard();
 const result=playTurn(input,at(4,4));

 assert.equal(result.ok,true);
 assert.equal(result.outcome,null);
 assert.equal(result.board.length,81);
 assert.equal(result.board[at(4,4)],1);
 assert.equal(result.board.filter(value=>value===1).length,1);
 assert.equal(result.board.filter(value=>value===2).length,1);
 assert.equal(result.board[at(3,4)],2,'确定性策略：离中心最近的 31');
 assert.deepEqual(input,emptyBoard(),'输入棋盘不得被修改');
 assert.notEqual(result.board,input,'成功时应返回新数组');
 assert.deepEqual(Object.keys(result).sort(),['board','ok','outcome']);
});

test('黑棋第五子成五即胜，白棋不再落子', () => {
 const board=emptyBoard();
 for(let col=0;col<4;col++)board[at(0,col)]=1;
 board[at(8,8)]=2;
 const before=board.slice();

 const result=playTurn(board,at(0,4));
 assert.equal(result.ok,true);
 assert.equal(result.outcome,'black');
 assert.equal(result.board[at(0,4)],1);
 assert.equal(result.board.filter(value=>value===2).length,1,'终局后白棋不应再落子');
 assert.deepEqual(board,before);
});

test('白棋能立即获胜时优先取胜，不挡黑棋四连', () => {
 const board=emptyBoard();
 for(let col=0;col<4;col++)board[at(0,col)]=1;
 for(let col=0;col<4;col++)board[at(8,col)]=2;

 const result=playTurn(board,at(4,4));
 assert.equal(result.ok,true);
 assert.equal(result.outcome,'white');
 assert.equal(result.board[at(8,4)],2);
 assert.equal(result.board[at(0,4)],0,'能赢时不应改为挡四连');
 assert.equal(result.board[at(4,4)],1);
});

test('黑棋四连时白棋挡住唯一成五点', () => {
 const board=emptyBoard();
 for(let col=0;col<4;col++)board[at(0,col)]=1;

 const result=playTurn(board,at(4,4));
 assert.equal(result.ok,true);
 assert.equal(result.outcome,null);
 assert.equal(result.board[at(0,4)],2);
 assert.equal(result.board.filter(value=>value===2).length,1);
 assert.equal(result.board.filter(value=>value===1).length,5);
});

test('断点四连同样会被白棋封住', () => {
 const board=emptyBoard();
 board[at(0,0)]=1;
 board[at(0,1)]=1;
 board[at(0,3)]=1;
 board[at(0,4)]=1;

 const result=playTurn(board,at(4,4));
 assert.equal(result.outcome,null);
 assert.equal(result.board[at(0,2)],2);
 assert.equal(result.board[at(4,4)],1);
});

test('挡黑棋四连优先于白棋自己的三连延伸', () => {
 const board=emptyBoard();
 for(let col=0;col<4;col++)board[at(0,col)]=1;
 for(let col=1;col<=3;col++)board[at(1,col)]=2;

 const result=playTurn(board,at(4,4));
 assert.equal(result.board[at(0,4)],2,'必须先挡住黑棋成五点');
 assert.equal(result.board[at(1,4)],0,'不得只顾自己连四');
 assert.equal(result.outcome,null);
});

test('已有五连或满盘终局时拒绝落子并返回原数组', () => {
 const blackWin=emptyBoard();
 for(let col=0;col<5;col++)blackWin[at(0,col)]=1;
 const blackResult=playTurn(blackWin,at(5,5));
 assert.deepEqual(blackResult,{ok:false,board:blackWin});
 assert.equal(blackResult.board,blackWin);

 const whiteWin=emptyBoard();
 for(let col=0;col<5;col++)whiteWin[at(8,col)]=2;
 assert.equal(playTurn(whiteWin,at(4,4)).ok,false);
 assert.equal(playTurn(whiteWin,at(4,4)).board,whiteWin);

 const full=drawBoard();
 assert.equal(full.includes(0),false);
 const fullResult=playTurn(full,0);
 assert.deepEqual(fullResult,{ok:false,board:full});
 assert.equal(fullResult.board,full);
});

test('黑棋填满最后一格且无人五连时判定和棋', () => {
 const board=drawBoard();
 assert.equal(board[at(4,4)],1);
 board[at(4,4)]=0;
 const whiteCount=board.filter(value=>value===2).length;

 const result=playTurn(board,at(4,4));
 assert.equal(result.ok,true);
 assert.equal(result.outcome,'draw');
 assert.equal(result.board[at(4,4)],1);
 assert.equal(result.board.includes(0),false);
 assert.equal(result.board.filter(value=>value===2).length,whiteCount,'和棋时白棋不再落子');
 assert.equal(board[at(4,4)],0);
});

test('非法索引、已占用点与异常棋盘都拒绝且返回原数组', () => {
 const board=emptyBoard();
 board[at(4,4)]=1;

 for(const index of [-1,81,40,4.5,'40',null,undefined,NaN,Infinity,true]){
  const result=playTurn(board,index);
  assert.equal(result.ok,false,'索引 '+String(index)+' 应被拒绝');
  assert.equal(result.board,board,'失败时必须返回原数组');
  assert.deepEqual(Object.keys(result).sort(),['board','ok']);
 }

 const badCell=emptyBoard();
 badCell[0]=3;
 const badValue=emptyBoard();
 badValue[0]='1';
 const badNaN=emptyBoard();
 badNaN[0]=NaN;
 const cases=[
  null,undefined,'board',[],
  emptyBoard().slice(0,80),Array(82).fill(0),
  Array(81).fill(3),badCell,badValue,badNaN,
 ];
 for(const bad of cases){
  const result=playTurn(bad,0);
  assert.equal(result.ok,false);
  assert.equal(result.board,bad);
 }
});

test('相同输入重复调用结果一致，冻结棋盘与入参都不被修改', () => {
 const input=emptyBoard();
 for(let col=0;col<4;col++)input[at(0,col)]=1;
 const before=input.slice();

 const first=playTurn(input,at(4,4));
 const second=playTurn(input,at(4,4));
 assert.deepEqual(first,second,'相同输入应得到相同输出');
 assert.notEqual(first.board,second.board);
 assert.deepEqual(input,before,'调用不得修改入参');

 const frozen=Object.freeze(emptyBoard());
 const frozenResult=playTurn(frozen,at(4,4));
 assert.equal(frozenResult.ok,true);
 assert.equal(frozen[at(4,4)],0);
 assert.equal(frozenResult.board[at(4,4)],1);
});
