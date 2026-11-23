// 林伯五子棋的单次落子规则（纯函数，无任何剧情/时段/物品副作用）。
// board 为 81 个交叉点、按行优先编号：0 空、1 玩家黑、2 林伯白。
// 玩家执黑先行，白棋以确定性的有限深度搜索比较进攻与应对。

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

// Each five-cell line contributes only while one colour can still complete it.
// Overlapping lines give open ends and intersecting threats greater weight.
const lines=[];
for(let row=0;row<SIZE;row++)for(let col=0;col<SIZE;col++)for(const [dr,dc] of DIRECTIONS){
 const r=row+4*dr,c=col+4*dc;
 if(r>=0&&r<SIZE&&c>=0&&c<SIZE)lines.push(Array.from({length:5},(_,i)=>(row+i*dr)*SIZE+col+i*dc));
}
const value=[0,2,18,180,2200,50000];
const gain=value.slice(1).map((n,i)=>n-value[i]);
const forced=1000000;
const proximity=Array.from({length:CELLS},(_,i)=>2*MID-Math.abs(rowOf(i)-MID)-Math.abs(colOf(i)-MID));

function assess(board,side){
 const ally=new Int32Array(CELLS),enemy=new Int32Array(CELLS);
 const wins=[],blocks=[],moves=[];
 let score=0;
 for(const line of lines){
  let us=0,them=0;
  for(const i of line){
   if(board[i]===side)us++;else if(board[i]!==EMPTY)them++;
  }
  if(us&&them||!us&&!them)continue;
  score+=value[us]-value[them];
  const threats=us?ally:enemy,weight=gain[us||them];
  for(const i of line)if(board[i]===EMPTY){
   threats[i]+=weight;
   if(us===4&&!wins.includes(i))wins.push(i);
   if(them===4&&!blocks.includes(i))blocks.push(i);
  }
 }
 for(let i=0;i<CELLS;i++)if(board[i]===EMPTY)moves.push(i);
 const priority=i=>ally[i]+enemy[i]+proximity[i];
 moves.sort((a,b)=>priority(b)-priority(a)||a-b);
 return {moves,wins,blocks,score};
}

// Negamax to four plies, extending a forced block past the horizon. Immediate
// wins and mandatory defences are always considered before pruning quiet moves.
function forecast(board,side,ply,alpha,beta){
 const {moves,wins,blocks,score}=assess(board,side);
 if(!moves.length)return 0;
 if(wins.length)return forced-ply;
 if(blocks.length>1)return -forced+ply+1;
 if(ply>=4&&(!blocks.length||ply>=8))return score;
 let best=-Infinity;
 for(const i of blocks.length?blocks:moves.slice(0,10)){
  board[i]=side;
  const result=-forecast(board,3-side,ply+1,-beta,-alpha);
  board[i]=EMPTY;
  best=Math.max(best,result);
  alpha=Math.max(alpha,best);
  if(alpha>=beta)break;
 }
 return best;
}

function whiteReply(board){
 const {moves,wins,blocks}=assess(board,WHITE);
 if(wins.length)return wins[0];
 if(blocks.length)return blocks[0];
 if(moves.length===CELLS-1)return moves.sort((a,b)=>proximity[b]-proximity[a]||a-b)[0];
 let best=-Infinity,reply=moves[0];
 for(const i of moves.slice(0,14)){
  board[i]=WHITE;
  const score=-forecast(board,BLACK,1,-Infinity,-best);
  board[i]=EMPTY;
  if(score>best){best=score;reply=i;}
 }
 return reply;
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

 const reply=whiteReply(next);
 next[reply]=WHITE;
 if(lineWinner(next,reply,WHITE))return {ok:true,board:next,outcome:'white'};
 if(!next.includes(EMPTY))return {ok:true,board:next,outcome:'draw'};
 return {ok:true,board:next,outcome:null};
}
