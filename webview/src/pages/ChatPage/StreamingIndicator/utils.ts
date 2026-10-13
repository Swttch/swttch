// 배열에서 이전 값과 다른 랜덤 값 선택
// When excluding the previous value leaves nothing (a user who set a single verb, #548), pick it again.
export function randomPick<T>(arr: readonly T[], exclude?: T): T {
    const others = exclude !== undefined ? arr.filter((v) => v !== exclude) : [...arr];
    const candidates = others.length > 0 ? others : arr;
    return candidates[Math.floor(Math.random() * candidates.length)];
}
