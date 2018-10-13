
/**
 * use await wait(x) to wait x seconds
 *
 * @export
 * @param {number} sec the amount of seconds
 * @returns a promise that resolves after the amount of seconds
 */
export default function (sec: number) {
  const ms = (sec) ? sec * 1000 : 1000
  return new Promise((resolve, reject) => {
    setTimeout(resolve, ms)
  })
}
