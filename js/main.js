// ===================================
// 設定（ここの数字を変えると遊び心地が変わる）
// ===================================
const FACE_W = 300;          // 顔の横幅（CSSの .face と同じ）
const FACE_H = 380;          // 顔の高さ（CSSの .face と同じ）
const CX = FACE_W / 2;       // 顔の中心 x = 150
const CY = FACE_H / 2;       // 顔の中心 y = 190

const FRICTION = 0.985;      // 1コマごとに速さを98.5%にする
const WALL_BOUNCE = 0.8;     // ふちに当たったら速さを80%にする
const BALL_BOUNCE = 0.9;     // パーツ同士がぶつかったら90%の勢いで弾き合う
const STOP_SPEED = 0.08;     // 速さがこれより小さくなったら止める
const MAX_PULL = 120;        // 引っぱれる最大の距離（px）
const MAX_SPEED = 18;        // いちばん強く打ったときの速さ（1コマに進むpx）
const SCORE_RANGE = 50;      // 正解からこの距離（px）以上ずれたら0点
const MAX_LOCKS = 2;         // 1人が固定できるパーツの数

// パーツの情報
// r = 当たり判定の円の半径、goal = 正解の位置、start = 最初に並べる位置
const PARTS = [
  { no: 1, src: 'images/brow-left.svg',  width: 60, r: 20, goal: { x: 99,  y: 105 }, start: { x: 90,  y: 255 } },
  { no: 2, src: 'images/brow-right.svg', width: 60, r: 20, goal: { x: 201, y: 105 }, start: { x: 150, y: 255 } },
  { no: 3, src: 'images/eye.svg',        width: 52, r: 22, goal: { x: 99,  y: 150 }, start: { x: 210, y: 255 } },
  { no: 4, src: 'images/eye.svg',        width: 52, r: 22, goal: { x: 201, y: 150 }, start: { x: 150, y: 315 } },
  { no: 5, src: 'images/nose.svg',       width: 38, r: 20, goal: { x: 150, y: 210 }, start: { x: 95,  y: 315 } },
  { no: 6, src: 'images/mouth.svg',      width: 84, r: 30, goal: { x: 150, y: 275 }, start: { x: 205, y: 315 } }
];

// プレイヤーごとの情報
const players = [
  { name: 'プレイヤー1', $board: $('#board-1'), $face: $('#face-1'), balls: [], next: 1, score: 0, locks: MAX_LOCKS },
  { name: 'プレイヤー2', $board: $('#board-2'), $face: $('#face-2'), balls: [], next: 1, score: 0, locks: MAX_LOCKS }
];

let turn = 0;           // 今どちらの番か（0 = プレイヤー1、1 = プレイヤー2）
let isMoving = false;   // パーツが動いている最中か
let isStarted = false;  // シャッフルが終わってゲームが始まったか
let isOver = false;     // ゲームが終わったか
let isAnswer = false;   // 「正解を見る」で正解の位置を表示中か
let isAnimating = false; // 正解の位置へ／から動いている最中か
let resultText = '';    // 終わったときの結果の文
let aiming = null;      // 引っぱっている最中の情報

// ===================================
// 準備：台にパーツを並べる
// ===================================
function setupBoard(player) {
  player.$face.empty();
  player.balls = [];
  player.next = 1;
  player.locks = MAX_LOCKS;

  PARTS.forEach(function (part) {
    // 正解の位置のうすい影
    $('<img class="goal">')
      .attr('src', part.src)
      .css({ left: part.goal.x + 'px', top: part.goal.y + 'px', width: part.width + 'px' })
      .appendTo(player.$face);

    // パーツ本体（当たり判定の円）
    const $el = $('<div class="ball"></div>').css({
      width: part.r * 2 + 'px',
      height: part.r * 2 + 'px'
    });
    $('<img>').attr('src', part.src).css('width', part.width + 'px').appendTo($el);
    $('<span class="num"></span>').text(part.no).appendTo($el);
    $el.appendTo(player.$face);

    const ball = { part: part, $el: $el, x: part.start.x, y: part.start.y, vx: 0, vy: 0, locked: false };
    player.balls.push(ball);
    draw(ball);
  });

  // 棒とガイド線
  player.$face.append('<div class="guide"></div><div class="cue"></div>');
}

function draw(ball) {
  ball.$el.css({ left: ball.x + 'px', top: ball.y + 'px' });
}

// ===================================
// 画面の表示を今の状態に合わせる
// ===================================
function updateView() {
  players.forEach(function (player, i) {
    player.$board.toggleClass('is-turn', isStarted && i === turn && !isOver);
    player.$board.find('.score-num').text(player.score);
    player.$board.find('.lock-num').text(player.locks);
    player.balls.forEach(function (ball) {
      const canShoot = isStarted && i === turn && !isOver && !isMoving && !isAnswer && !isAnimating
        && ball.part.no === player.next;
      ball.$el.toggleClass('is-next', canShoot);
      ball.$el.toggleClass('can-lock', canLock(player, ball));
      ball.$el.toggleClass('is-locked', ball.locked);
    });
  });

  // 上に出す文
  let text;
  if (isAnswer) {
    text = '正解の配置を表示中（「もとに戻す」で元の位置に戻ります）';
  } else if (isOver) {
    text = resultText;
  } else if (isStarted) {
    const player = players[turn];
    text = player.name + 'の番：' + player.next + '番のパーツを打とう';
  } else if (isMoving) {
    text = 'シャッフル中…';
  } else {
    text = '「シャッフルしてスタート」を押してね';
  }
  $('.status').text(text);
}

// ===================================
// 得点：正解の位置からの距離で計算
// ===================================

// 1つのパーツが、ある正解の位置に対して何点か
function pointsFor(ball, goal) {
  const dx = ball.x - goal.x;
  const dy = ball.y - goal.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // ぴったりで100点。ずれるほど減って、SCORE_RANGE以上ずれたら0点
  return Math.max(0, Math.round(100 * (1 - dist / SCORE_RANGE)));
}

// 左右のペア（まゆ・目）は、入れ替わっていても点数が高いほうで数える
function pairPoints(a, b) {
  const normal = pointsFor(a, a.part.goal) + pointsFor(b, b.part.goal);   // そのまま
  const swapped = pointsFor(a, b.part.goal) + pointsFor(b, a.part.goal);  // 左右を入れ替え
  return Math.max(normal, swapped);
}

function calcScore(player) {
  const b = player.balls;  // b[0]=①左まゆ b[1]=②右まゆ b[2]=③左目 b[3]=④右目 b[4]=⑤鼻 b[5]=⑥口
  return pairPoints(b[0], b[1])
       + pairPoints(b[2], b[3])
       + pointsFor(b[4], b[4].part.goal)
       + pointsFor(b[5], b[5].part.goal);
}

// ===================================
// マウスで引っぱって打つ
// ===================================
function getMousePos(e, $face) {
  const offset = $face.offset();
  return { x: e.pageX - offset.left, y: e.pageY - offset.top };
}

// そのパーツを今固定できるか
function canLock(player, ball) {
  return isStarted && !isOver && !isMoving && !isAnswer && !isAnimating
    && player.locks > 0              // 固定の残りがある
    && !ball.locked                  // まだ固定していない
    && ball.part.no < player.next;   // 打ち終わったパーツ
}

$('.face').on('pointerdown', '.ball', function (e) {
  if (!isStarted || isMoving || isOver || isAnswer || isAnimating) return;

  // 押されたパーツと、その台の持ち主を探す
  let owner = null;
  let ball = null;
  players.forEach(function (player) {
    const found = player.balls.find(function (b) { return b.$el[0] === e.currentTarget; });
    if (found) {
      owner = player;
      ball = found;
    }
  });
  if (!ball) return;

  // 打ち終わったパーツなら「固定」
  if (canLock(owner, ball)) {
    ball.locked = true;
    owner.locks--;
    updateView();
    return;
  }

  // 「今の番の人」の「次に打てる番号」なら「打つ」準備
  if (owner !== players[turn] || ball.part.no !== owner.next) return;

  e.preventDefault();
  aiming = { player: owner, ball: ball, pull: 0, dirX: 0, dirY: 0 };
});

$(document).on('pointermove', function (e) {
  if (!aiming) return;

  const ball = aiming.ball;
  const mouse = getMousePos(e, aiming.player.$face);

  // マウス → パーツ の向きが「飛ぶ向き」
  const dx = ball.x - mouse.x;
  const dy = ball.y - mouse.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return;

  aiming.pull = Math.min(dist, MAX_PULL);
  aiming.dirX = dx / dist;
  aiming.dirY = dy / dist;

  const angle = Math.atan2(dy, dx) * 180 / Math.PI;  // 飛ぶ向きの角度（度）

  // 棒：先っぽをパーツの後ろに置く。引くほど離れる
  const gap = ball.part.r + 6 + aiming.pull * 0.5;
  const tipX = ball.x - aiming.dirX * gap;
  const tipY = ball.y - aiming.dirY * gap;
  aiming.player.$face.find('.cue').css({
    display: 'block',
    left: tipX - 180 + 'px',
    top: tipY - 4 + 'px',
    transform: 'rotate(' + angle + 'deg)'
  });

  // ガイド線：飛ぶ向きに、強さに合わせた長さで出す
  aiming.player.$face.find('.guide').css({
    display: 'block',
    left: ball.x + 'px',
    top: ball.y + 'px',
    width: aiming.pull * 1.5 + 'px',
    transform: 'rotate(' + angle + 'deg)'
  });
});

$(document).on('pointerup pointercancel', function () {
  if (!aiming) return;

  const player = aiming.player;
  const ball = aiming.ball;
  const speed = aiming.pull / MAX_PULL * MAX_SPEED;

  player.$face.find('.cue, .guide').hide();

  // ほとんど引いていなければ、打たずにやめる
  if (speed < 1) {
    aiming = null;
    return;
  }

  ball.vx = aiming.dirX * speed;
  ball.vy = aiming.dirY * speed;
  aiming = null;

  player.next++;
  isMoving = true;
  updateView();
  runPhysics([player.balls], endShot);
});

// ===================================
// 動き：全部止まるまで1コマずつ動かす
// ===================================
// boardsList = 動かす台のパーツの配列のリスト（1台でも2台でもOK）
// onDone = 全部止まったら呼ぶ関数
function runPhysics(boardsList, onDone) {
  function frame() {
    let anyMoving = false;
    boardsList.forEach(function (balls) {
      if (stepBalls(balls)) {
        anyMoving = true;
      }
    });

    if (anyMoving) {
      requestAnimationFrame(frame);
    } else {
      onDone();
    }
  }
  requestAnimationFrame(frame);
}

// 1台分を1コマ動かす。まだ動いているパーツがあれば true を返す
function stepBalls(balls) {
  // ① 進む ＋ ふちで跳ね返る ＋ 摩擦
  balls.forEach(function (ball) {
    ball.x += ball.vx;
    ball.y += ball.vy;
    bounceWall(ball);

    ball.vx *= FRICTION;
    ball.vy *= FRICTION;
    if (Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) < STOP_SPEED) {
      ball.vx = 0;
      ball.vy = 0;
    }
  });

  // ② パーツ同士の衝突（すべての組み合わせを調べる）
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      collide(balls[i], balls[j]);
    }
  }

  // ③ 画面に反映
  balls.forEach(draw);

  // ④ まだ動いているパーツがあるか
  return balls.some(function (ball) { return ball.vx !== 0 || ball.vy !== 0; });
}

// ふち（楕円）で跳ね返る
function bounceWall(ball) {
  const rx = CX - ball.part.r;   // パーツの中心が動ける楕円の横半径
  const ry = CY - ball.part.r;   // パーツの中心が動ける楕円の縦半径
  const dx = (ball.x - CX) / rx;
  const dy = (ball.y - CY) / ry;
  const d = dx * dx + dy * dy;
  if (d <= 1) return;

  // ふちの上まで戻す
  const k = 1 / Math.sqrt(d);
  ball.x = CX + (ball.x - CX) * k;
  ball.y = CY + (ball.y - CY) * k;

  // ふちに垂直な向き（法線）
  let nx = (ball.x - CX) / (rx * rx);
  let ny = (ball.y - CY) / (ry * ry);
  const len = Math.sqrt(nx * nx + ny * ny);
  nx /= len;
  ny /= len;

  // 鏡のように反射
  const dot = ball.vx * nx + ball.vy * ny;
  if (dot > 0) {
    ball.vx = (ball.vx - 2 * dot * nx) * WALL_BOUNCE;
    ball.vy = (ball.vy - 2 * dot * ny) * WALL_BOUNCE;
  }
}

// パーツ同士の衝突
function collide(a, b) {
  if (a.locked && b.locked) return;  // 両方固定なら何もしない

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = a.part.r + b.part.r;   // 2つの円の半径の合計
  if (dist === 0 || dist >= minDist) return;  // 離れていれば何もしない

  // a → b の向き
  const nx = dx / dist;
  const ny = dy / dist;

  // 重なった分を押し戻す（固定されている側は動かさない）
  const overlap = minDist - dist;
  if (a.locked) {
    b.x += nx * overlap;
    b.y += ny * overlap;
  } else if (b.locked) {
    a.x -= nx * overlap;
    a.y -= ny * overlap;
  } else {
    a.x -= nx * overlap / 2;
    a.y -= ny * overlap / 2;
    b.x += nx * overlap / 2;
    b.y += ny * overlap / 2;
  }

  // ぶつかる向きの速さの差
  const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (rel <= 0) return;  // すでに離れていく途中なら何もしない

  if (a.locked) {
    // a は壁と同じ。b だけが跳ね返る
    const push = rel * (1 + BALL_BOUNCE);
    b.vx += push * nx;
    b.vy += push * ny;
  } else if (b.locked) {
    // b は壁と同じ。a だけが跳ね返る
    const push = rel * (1 + BALL_BOUNCE);
    a.vx -= push * nx;
    a.vy -= push * ny;
  } else {
    // 勢いを半分ずつ受け渡す
    const push = rel * (1 + BALL_BOUNCE) / 2;
    a.vx -= push * nx;
    a.vy -= push * ny;
    b.vx += push * nx;
    b.vy += push * ny;
  }
}

// ===================================
// 1打が終わったら：得点と手番
// ===================================
function endShot() {
  isMoving = false;

  const player = players[turn];
  player.score = calcScore(player);

  const other = 1 - turn;
  if (players[other].next <= PARTS.length) {
    turn = other;               // 相手がまだ打てるなら交代
  } else if (player.next > PARTS.length) {
    finish();                   // 2人とも6つ打ち終わったら終了
    return;
  }

  updateView();
}

// ===================================
// 勝ち負けと紙吹雪
// ===================================
function finish() {
  isOver = true;
  $('.boards').removeClass('is-playing');

  const s1 = players[0].score;
  const s2 = players[1].score;

  if (s1 === s2) {
    resultText = '引き分け！（' + s1 + '点）';
    updateView();
    return;
  }

  const winner = s1 > s2 ? players[0] : players[1];
  resultText = winner.name + 'の勝ち！';
  updateView();
  winner.$board.addClass('is-winner');
  fireConfetti(winner.$board[0]);
}

function fireConfetti(el) {
  if (typeof confetti === 'undefined') return;  // 読み込めていなければ何もしない

  // 勝った台の真ん中から出す（画面の幅・高さに対する割合で指定）
  const rect = el.getBoundingClientRect();
  const origin = {
    x: (rect.left + rect.width / 2) / window.innerWidth,
    y: (rect.top + rect.height / 2) / window.innerHeight
  };

  confetti({ particleCount: 150, spread: 90, origin: origin });
  setTimeout(function () { confetti({ particleCount: 100, spread: 120, origin: origin }); }, 400);
  setTimeout(function () { confetti({ particleCount: 80, spread: 160, origin: origin }); }, 800);
}

// ===================================
// シャッフルしてスタート
// ===================================
function getRandom(min, max) {
  return Math.random() * (max - min) + min;
}

function startGame() {
  if (isMoving || isAnimating) return;  // 動いている最中は押しても無視

  turn = 0;
  isStarted = false;
  isOver = false;
  isAnswer = false;
  aiming = null;
  $('.btn-answer').text('正解を見る');
  $('.boards').removeClass('is-playing');
  $('.board').removeClass('is-winner');
  players.forEach(function (player) {
    setupBoard(player);
    player.score = 0;
  });

  // パーツごとの飛ばし方を1回だけ決めて、2つの台に同じものを使う（公平にするため）
  const kicks = PARTS.map(function () {
    const speed = getRandom(10, 16);
    const dir = getRandom(0, Math.PI * 2);
    return { vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed };
  });

  players.forEach(function (player) {
    player.balls.forEach(function (ball, i) {
      ball.vx = kicks[i].vx;
      ball.vy = kicks[i].vy;
    });
  });

  isMoving = true;
  updateView();
  runPhysics([players[0].balls, players[1].balls], function () {
    isMoving = false;
    isStarted = true;
    $('.boards').addClass('is-playing');
    players.forEach(function (player) {
      player.score = calcScore(player);
    });
    updateView();
  });
}

$('.btn-start').on('click', startGame);

// ===================================
// 正解を見る・もとに戻す
// ===================================
$('.btn-answer').on('click', function () {
  if (isMoving || isAnimating || aiming) return;  // 動いている最中は押しても無視

  isAnswer = !isAnswer;  // true ⇔ false を切り替える
  $(this).text(isAnswer ? 'もとに戻す' : '正解を見る');

  // 見た目だけ動かす（ball.x と ball.y は変えないので、戻せば続きから遊べる）
  isAnimating = true;
  $('.face').addClass('is-animating');
  players.forEach(function (player) {
    player.balls.forEach(function (ball) {
      const pos = isAnswer ? ball.part.goal : ball;
      ball.$el.css({ left: pos.x + 'px', top: pos.y + 'px' });
    });
  });
  updateView();

  // 0.6秒（CSSの transition と同じ）たったら動きを止める
  setTimeout(function () {
    $('.face').removeClass('is-animating');
    isAnimating = false;
    updateView();
  }, 600);
});

// 最初は並べただけで待つ
players.forEach(setupBoard);
updateView();