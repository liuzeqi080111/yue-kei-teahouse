// 林伯五子棋的单次落子规则（纯函数，无任何剧情/时段/物品副作用）。
// board 为 81 个交叉点、按行优先编号：0 空、1 玩家黑、2 林伯白。
// 玩家先落黑子；若未终局，白棋按“能立即赢 → 挡黑棋即胜点 → 离中心最近的空点”
// 的确定性顺序回一手。相同输入永远得到相同输出。

const SIZE=9;
const CELLS=SIZE*SIZE;
const MID=SIZE>>1;
const EMPTY=0;
const BLACK=1;
const WHITE=2;
const DIRECTIONS=[[0,1],[1,0],[1,1],[1,-1]];

const rowOf=index=>Math.floor(index/SIZE);
const colOf=index=>index%SIZE;

function validBoard(board){
 if(!Array.isArray(board)||board.length!==CELLS)return false;
 for(const cell of board){
  if(cell!==EMPTY&&cell!==BLACK&&cell!==WHITE)return false;
 }
 return true;
}

// 以 index 为起点，检查四个方向是否形成五连（含长连）。
function lineWinner(board,index,player){
 const row=rowOf(index);
 const col=colOf(index);
 for(const [dr,dc] of DIRECTIONS){
  let count=1;
  for(const sign of [1,-1]){
   let r=row+dr*sign;
   let c=col+dc*sign;
   while(r>=0&&r<SIZE&&c>=0&&c<SIZE&&board[r*SIZE+c]===player){
    count++;
    r+=dr*sign;
    c+=dc*sign;
   }
  }
  if(count>=5)return true;
 }
 return false;
}

function existingWinner(board){
 for(let index=0;index<CELLS;index++){
  const player=board[index];
  if(player!==EMPTY&&lineWinner(board,index,player))return true;
 }
 return false;
}

// 白棋候补顺序：先近中心，再按编号升序，保证策略可复现。
function distanceToCenter(index){
 return Math.abs(rowOf(index)-MID)+Math.abs(colOf(index)-MID);
}

function candidateOrder(board){
 const empty=[];
 for(let index=0;index<CELLS;index++){
  if(board[index]===EMPTY)empty.push(index);
 }
 return empty.sort((a,b)=>distanceToCenter(a)-distanceToCenter(b)||a-b);
}

// 在可变的副本上试落一子后还原，用来判断某点是否会立即成五。
function wouldWin(board,index,player){
 board[index]=player;
 const won=lineWinner(board,index,player);
 board[index]=EMPTY;
 return won;
}

// 返回 {ok:true,board:新数组,outcome} 或 {ok:false,board:原数组}。
// 非法棋盘、非法/已占用交叉点、已有五连或已满盘的终局都拒绝，且不改动入参。
export function playTurn(board,index){
 if(!validBoard(board))return {ok:false,board};
 if(existingWinner(board))return {ok:false,board};
 if(!board.includes(EMPTY))return {ok:false,board};
 if(!Number.isInteger(index)||index<0||index>=CELLS)return {ok:false,board};
 if(board[index]!==EMPTY)return {ok:false,board};

 const next=board.slice();
 next[index]=BLACK;
 if(lineWinner(next,index,BLACK))return {ok:true,board:next,outcome:'black'};
 if(!next.includes(EMPTY))return {ok:true,board:next,outcome:'draw'};

 const candidates=candidateOrder(next);
 let reply=-1;

 // 1) 白棋能赢就赢。
 for(const candidate of candidates){
  if(wouldWin(next,candidate,WHITE)){reply=candidate;break;}
 }

 // 2) 否则挡住黑棋下一手会成五的点（四连或断点四连都算）。
 if(reply<0){
  for(const candidate of candidates){
   if(wouldWin(next,candidate,BLACK)){reply=candidate;break;}
  }
 }

 // 3) 没有直接胜负点时，落在离中心最近的空点。
 if(reply<0)reply=candidates[0];

 next[reply]=WHITE;
 if(lineWinner(next,reply,WHITE))return {ok:true,board:next,outcome:'white'};
 if(!next.includes(EMPTY))return {ok:true,board:next,outcome:'draw'};
 return {ok:true,board:next,outcome:null};
}
