import { keyboardRead, validateKeyboardFrame } from "../keyboard";

// Source: demoMode.store-CXKd1LXo.js, QM.transferForResult and jM/HM/$M.
// Existing verified selectors remain mandatory; no additional opcodes are enabled.
export const duckbreadAdapter = {
  family: "DUCKBREAD",
  reportId: 0,
  frameLength: 32,
  readFrame: keyboardRead,
  validateRead: validateKeyboardFrame,
  matchesReply(request: Uint8Array, response: Uint8Array) {
    if (response[0] !== request[0]) return false;
    if (request[0] === 18)
      return response
        .slice(1, 4)
        .every((value, index) => value === request[index + 1]);
    if ([2, 3].includes(request[0])) {
      if (response[1] !== request[1] || response[2] !== request[2])
        return false;
      if ([13, 14].includes(request[2]))
        return response
          .slice(3, 8)
          .every((value, index) => value === request[index + 3]);
      if ([3, 7].includes(request[2]))
        return response[3] === request[3] && response[4] === request[4];
      return true;
    }
    if ([4, 5].includes(request[0]))
      return response
        .slice(1, 4)
        .every((value, index) => value === request[index + 1]);
    if ([7, 8].includes(request[0])) {
      if (response[1] !== request[1]) return false;
      if ([66, 69].includes(request[1]))
        return response.slice(2, 5).every((v, i) => v === request[i + 2]);
      return request[1] === 65;
    }
    return false;
  },
};
