var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node-built-in-modules:crypto
import libDefault from "crypto";
var require_crypto = __commonJS({
  "node-built-in-modules:crypto"(exports, module) {
    module.exports = libDefault;
  }
});

// node_modules/bcryptjs/dist/bcrypt.js
var require_bcrypt = __commonJS({
  "node_modules/bcryptjs/dist/bcrypt.js"(exports, module) {
    (function(global, factory) {
      if (typeof define === "function" && define["amd"])
        define([], factory);
      else if (typeof __require === "function" && typeof module === "object" && module && module["exports"])
        module["exports"] = factory();
      else
        (global["dcodeIO"] = global["dcodeIO"] || {})["bcrypt"] = factory();
    })(exports, function() {
      "use strict";
      var bcrypt2 = {};
      var randomFallback = null;
      function random(len) {
        if (typeof module !== "undefined" && module && module["exports"])
          try {
            return require_crypto()["randomBytes"](len);
          } catch (e) {
          }
        try {
          var a;
          (self["crypto"] || self["msCrypto"])["getRandomValues"](a = new Uint32Array(len));
          return Array.prototype.slice.call(a);
        } catch (e) {
        }
        if (!randomFallback)
          throw Error("Neither WebCryptoAPI nor a crypto module is available. Use bcrypt.setRandomFallback to set an alternative");
        return randomFallback(len);
      }
      __name(random, "random");
      var randomAvailable = false;
      try {
        random(1);
        randomAvailable = true;
      } catch (e) {
      }
      randomFallback = null;
      bcrypt2.setRandomFallback = function(random2) {
        randomFallback = random2;
      };
      bcrypt2.genSaltSync = function(rounds, seed_length) {
        rounds = rounds || GENSALT_DEFAULT_LOG2_ROUNDS;
        if (typeof rounds !== "number")
          throw Error("Illegal arguments: " + typeof rounds + ", " + typeof seed_length);
        if (rounds < 4)
          rounds = 4;
        else if (rounds > 31)
          rounds = 31;
        var salt = [];
        salt.push("$2a$");
        if (rounds < 10)
          salt.push("0");
        salt.push(rounds.toString());
        salt.push("$");
        salt.push(base64_encode(random(BCRYPT_SALT_LEN), BCRYPT_SALT_LEN));
        return salt.join("");
      };
      bcrypt2.genSalt = function(rounds, seed_length, callback) {
        if (typeof seed_length === "function")
          callback = seed_length, seed_length = void 0;
        if (typeof rounds === "function")
          callback = rounds, rounds = void 0;
        if (typeof rounds === "undefined")
          rounds = GENSALT_DEFAULT_LOG2_ROUNDS;
        else if (typeof rounds !== "number")
          throw Error("illegal arguments: " + typeof rounds);
        function _async(callback2) {
          nextTick(function() {
            try {
              callback2(null, bcrypt2.genSaltSync(rounds));
            } catch (err) {
              callback2(err);
            }
          });
        }
        __name(_async, "_async");
        if (callback) {
          if (typeof callback !== "function")
            throw Error("Illegal callback: " + typeof callback);
          _async(callback);
        } else
          return new Promise(function(resolve, reject) {
            _async(function(err, res) {
              if (err) {
                reject(err);
                return;
              }
              resolve(res);
            });
          });
      };
      bcrypt2.hashSync = function(s, salt) {
        if (typeof salt === "undefined")
          salt = GENSALT_DEFAULT_LOG2_ROUNDS;
        if (typeof salt === "number")
          salt = bcrypt2.genSaltSync(salt);
        if (typeof s !== "string" || typeof salt !== "string")
          throw Error("Illegal arguments: " + typeof s + ", " + typeof salt);
        return _hash(s, salt);
      };
      bcrypt2.hash = function(s, salt, callback, progressCallback) {
        function _async(callback2) {
          if (typeof s === "string" && typeof salt === "number")
            bcrypt2.genSalt(salt, function(err, salt2) {
              _hash(s, salt2, callback2, progressCallback);
            });
          else if (typeof s === "string" && typeof salt === "string")
            _hash(s, salt, callback2, progressCallback);
          else
            nextTick(callback2.bind(this, Error("Illegal arguments: " + typeof s + ", " + typeof salt)));
        }
        __name(_async, "_async");
        if (callback) {
          if (typeof callback !== "function")
            throw Error("Illegal callback: " + typeof callback);
          _async(callback);
        } else
          return new Promise(function(resolve, reject) {
            _async(function(err, res) {
              if (err) {
                reject(err);
                return;
              }
              resolve(res);
            });
          });
      };
      function safeStringCompare(known, unknown) {
        var right = 0, wrong = 0;
        for (var i = 0, k = known.length; i < k; ++i) {
          if (known.charCodeAt(i) === unknown.charCodeAt(i))
            ++right;
          else
            ++wrong;
        }
        if (right < 0)
          return false;
        return wrong === 0;
      }
      __name(safeStringCompare, "safeStringCompare");
      bcrypt2.compareSync = function(s, hash) {
        if (typeof s !== "string" || typeof hash !== "string")
          throw Error("Illegal arguments: " + typeof s + ", " + typeof hash);
        if (hash.length !== 60)
          return false;
        return safeStringCompare(bcrypt2.hashSync(s, hash.substr(0, hash.length - 31)), hash);
      };
      bcrypt2.compare = function(s, hash, callback, progressCallback) {
        function _async(callback2) {
          if (typeof s !== "string" || typeof hash !== "string") {
            nextTick(callback2.bind(this, Error("Illegal arguments: " + typeof s + ", " + typeof hash)));
            return;
          }
          if (hash.length !== 60) {
            nextTick(callback2.bind(this, null, false));
            return;
          }
          bcrypt2.hash(s, hash.substr(0, 29), function(err, comp) {
            if (err)
              callback2(err);
            else
              callback2(null, safeStringCompare(comp, hash));
          }, progressCallback);
        }
        __name(_async, "_async");
        if (callback) {
          if (typeof callback !== "function")
            throw Error("Illegal callback: " + typeof callback);
          _async(callback);
        } else
          return new Promise(function(resolve, reject) {
            _async(function(err, res) {
              if (err) {
                reject(err);
                return;
              }
              resolve(res);
            });
          });
      };
      bcrypt2.getRounds = function(hash) {
        if (typeof hash !== "string")
          throw Error("Illegal arguments: " + typeof hash);
        return parseInt(hash.split("$")[2], 10);
      };
      bcrypt2.getSalt = function(hash) {
        if (typeof hash !== "string")
          throw Error("Illegal arguments: " + typeof hash);
        if (hash.length !== 60)
          throw Error("Illegal hash length: " + hash.length + " != 60");
        return hash.substring(0, 29);
      };
      var nextTick = typeof process !== "undefined" && process && typeof process.nextTick === "function" ? typeof setImmediate === "function" ? setImmediate : process.nextTick : setTimeout;
      function stringToBytes(str) {
        var out = [], i = 0;
        utfx.encodeUTF16toUTF8(function() {
          if (i >= str.length) return null;
          return str.charCodeAt(i++);
        }, function(b) {
          out.push(b);
        });
        return out;
      }
      __name(stringToBytes, "stringToBytes");
      var BASE64_CODE = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split("");
      var BASE64_INDEX = [
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        0,
        1,
        54,
        55,
        56,
        57,
        58,
        59,
        60,
        61,
        62,
        63,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
        22,
        23,
        24,
        25,
        26,
        27,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        28,
        29,
        30,
        31,
        32,
        33,
        34,
        35,
        36,
        37,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        46,
        47,
        48,
        49,
        50,
        51,
        52,
        53,
        -1,
        -1,
        -1,
        -1,
        -1
      ];
      var stringFromCharCode = String.fromCharCode;
      function base64_encode(b, len) {
        var off = 0, rs = [], c1, c2;
        if (len <= 0 || len > b.length)
          throw Error("Illegal len: " + len);
        while (off < len) {
          c1 = b[off++] & 255;
          rs.push(BASE64_CODE[c1 >> 2 & 63]);
          c1 = (c1 & 3) << 4;
          if (off >= len) {
            rs.push(BASE64_CODE[c1 & 63]);
            break;
          }
          c2 = b[off++] & 255;
          c1 |= c2 >> 4 & 15;
          rs.push(BASE64_CODE[c1 & 63]);
          c1 = (c2 & 15) << 2;
          if (off >= len) {
            rs.push(BASE64_CODE[c1 & 63]);
            break;
          }
          c2 = b[off++] & 255;
          c1 |= c2 >> 6 & 3;
          rs.push(BASE64_CODE[c1 & 63]);
          rs.push(BASE64_CODE[c2 & 63]);
        }
        return rs.join("");
      }
      __name(base64_encode, "base64_encode");
      function base64_decode(s, len) {
        var off = 0, slen = s.length, olen = 0, rs = [], c1, c2, c3, c4, o, code;
        if (len <= 0)
          throw Error("Illegal len: " + len);
        while (off < slen - 1 && olen < len) {
          code = s.charCodeAt(off++);
          c1 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
          code = s.charCodeAt(off++);
          c2 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
          if (c1 == -1 || c2 == -1)
            break;
          o = c1 << 2 >>> 0;
          o |= (c2 & 48) >> 4;
          rs.push(stringFromCharCode(o));
          if (++olen >= len || off >= slen)
            break;
          code = s.charCodeAt(off++);
          c3 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
          if (c3 == -1)
            break;
          o = (c2 & 15) << 4 >>> 0;
          o |= (c3 & 60) >> 2;
          rs.push(stringFromCharCode(o));
          if (++olen >= len || off >= slen)
            break;
          code = s.charCodeAt(off++);
          c4 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
          o = (c3 & 3) << 6 >>> 0;
          o |= c4;
          rs.push(stringFromCharCode(o));
          ++olen;
        }
        var res = [];
        for (off = 0; off < olen; off++)
          res.push(rs[off].charCodeAt(0));
        return res;
      }
      __name(base64_decode, "base64_decode");
      var utfx = (function() {
        "use strict";
        var utfx2 = {};
        utfx2.MAX_CODEPOINT = 1114111;
        utfx2.encodeUTF8 = function(src, dst) {
          var cp = null;
          if (typeof src === "number")
            cp = src, src = /* @__PURE__ */ __name(function() {
              return null;
            }, "src");
          while (cp !== null || (cp = src()) !== null) {
            if (cp < 128)
              dst(cp & 127);
            else if (cp < 2048)
              dst(cp >> 6 & 31 | 192), dst(cp & 63 | 128);
            else if (cp < 65536)
              dst(cp >> 12 & 15 | 224), dst(cp >> 6 & 63 | 128), dst(cp & 63 | 128);
            else
              dst(cp >> 18 & 7 | 240), dst(cp >> 12 & 63 | 128), dst(cp >> 6 & 63 | 128), dst(cp & 63 | 128);
            cp = null;
          }
        };
        utfx2.decodeUTF8 = function(src, dst) {
          var a, b, c, d, fail = /* @__PURE__ */ __name(function(b2) {
            b2 = b2.slice(0, b2.indexOf(null));
            var err = Error(b2.toString());
            err.name = "TruncatedError";
            err["bytes"] = b2;
            throw err;
          }, "fail");
          while ((a = src()) !== null) {
            if ((a & 128) === 0)
              dst(a);
            else if ((a & 224) === 192)
              (b = src()) === null && fail([a, b]), dst((a & 31) << 6 | b & 63);
            else if ((a & 240) === 224)
              ((b = src()) === null || (c = src()) === null) && fail([a, b, c]), dst((a & 15) << 12 | (b & 63) << 6 | c & 63);
            else if ((a & 248) === 240)
              ((b = src()) === null || (c = src()) === null || (d = src()) === null) && fail([a, b, c, d]), dst((a & 7) << 18 | (b & 63) << 12 | (c & 63) << 6 | d & 63);
            else throw RangeError("Illegal starting byte: " + a);
          }
        };
        utfx2.UTF16toUTF8 = function(src, dst) {
          var c1, c2 = null;
          while (true) {
            if ((c1 = c2 !== null ? c2 : src()) === null)
              break;
            if (c1 >= 55296 && c1 <= 57343) {
              if ((c2 = src()) !== null) {
                if (c2 >= 56320 && c2 <= 57343) {
                  dst((c1 - 55296) * 1024 + c2 - 56320 + 65536);
                  c2 = null;
                  continue;
                }
              }
            }
            dst(c1);
          }
          if (c2 !== null) dst(c2);
        };
        utfx2.UTF8toUTF16 = function(src, dst) {
          var cp = null;
          if (typeof src === "number")
            cp = src, src = /* @__PURE__ */ __name(function() {
              return null;
            }, "src");
          while (cp !== null || (cp = src()) !== null) {
            if (cp <= 65535)
              dst(cp);
            else
              cp -= 65536, dst((cp >> 10) + 55296), dst(cp % 1024 + 56320);
            cp = null;
          }
        };
        utfx2.encodeUTF16toUTF8 = function(src, dst) {
          utfx2.UTF16toUTF8(src, function(cp) {
            utfx2.encodeUTF8(cp, dst);
          });
        };
        utfx2.decodeUTF8toUTF16 = function(src, dst) {
          utfx2.decodeUTF8(src, function(cp) {
            utfx2.UTF8toUTF16(cp, dst);
          });
        };
        utfx2.calculateCodePoint = function(cp) {
          return cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4;
        };
        utfx2.calculateUTF8 = function(src) {
          var cp, l = 0;
          while ((cp = src()) !== null)
            l += utfx2.calculateCodePoint(cp);
          return l;
        };
        utfx2.calculateUTF16asUTF8 = function(src) {
          var n = 0, l = 0;
          utfx2.UTF16toUTF8(src, function(cp) {
            ++n;
            l += utfx2.calculateCodePoint(cp);
          });
          return [n, l];
        };
        return utfx2;
      })();
      Date.now = Date.now || function() {
        return +/* @__PURE__ */ new Date();
      };
      var BCRYPT_SALT_LEN = 16;
      var GENSALT_DEFAULT_LOG2_ROUNDS = 10;
      var BLOWFISH_NUM_ROUNDS = 16;
      var MAX_EXECUTION_TIME = 100;
      var P_ORIG = [
        608135816,
        2242054355,
        320440878,
        57701188,
        2752067618,
        698298832,
        137296536,
        3964562569,
        1160258022,
        953160567,
        3193202383,
        887688300,
        3232508343,
        3380367581,
        1065670069,
        3041331479,
        2450970073,
        2306472731
      ];
      var S_ORIG = [
        3509652390,
        2564797868,
        805139163,
        3491422135,
        3101798381,
        1780907670,
        3128725573,
        4046225305,
        614570311,
        3012652279,
        134345442,
        2240740374,
        1667834072,
        1901547113,
        2757295779,
        4103290238,
        227898511,
        1921955416,
        1904987480,
        2182433518,
        2069144605,
        3260701109,
        2620446009,
        720527379,
        3318853667,
        677414384,
        3393288472,
        3101374703,
        2390351024,
        1614419982,
        1822297739,
        2954791486,
        3608508353,
        3174124327,
        2024746970,
        1432378464,
        3864339955,
        2857741204,
        1464375394,
        1676153920,
        1439316330,
        715854006,
        3033291828,
        289532110,
        2706671279,
        2087905683,
        3018724369,
        1668267050,
        732546397,
        1947742710,
        3462151702,
        2609353502,
        2950085171,
        1814351708,
        2050118529,
        680887927,
        999245976,
        1800124847,
        3300911131,
        1713906067,
        1641548236,
        4213287313,
        1216130144,
        1575780402,
        4018429277,
        3917837745,
        3693486850,
        3949271944,
        596196993,
        3549867205,
        258830323,
        2213823033,
        772490370,
        2760122372,
        1774776394,
        2652871518,
        566650946,
        4142492826,
        1728879713,
        2882767088,
        1783734482,
        3629395816,
        2517608232,
        2874225571,
        1861159788,
        326777828,
        3124490320,
        2130389656,
        2716951837,
        967770486,
        1724537150,
        2185432712,
        2364442137,
        1164943284,
        2105845187,
        998989502,
        3765401048,
        2244026483,
        1075463327,
        1455516326,
        1322494562,
        910128902,
        469688178,
        1117454909,
        936433444,
        3490320968,
        3675253459,
        1240580251,
        122909385,
        2157517691,
        634681816,
        4142456567,
        3825094682,
        3061402683,
        2540495037,
        79693498,
        3249098678,
        1084186820,
        1583128258,
        426386531,
        1761308591,
        1047286709,
        322548459,
        995290223,
        1845252383,
        2603652396,
        3431023940,
        2942221577,
        3202600964,
        3727903485,
        1712269319,
        422464435,
        3234572375,
        1170764815,
        3523960633,
        3117677531,
        1434042557,
        442511882,
        3600875718,
        1076654713,
        1738483198,
        4213154764,
        2393238008,
        3677496056,
        1014306527,
        4251020053,
        793779912,
        2902807211,
        842905082,
        4246964064,
        1395751752,
        1040244610,
        2656851899,
        3396308128,
        445077038,
        3742853595,
        3577915638,
        679411651,
        2892444358,
        2354009459,
        1767581616,
        3150600392,
        3791627101,
        3102740896,
        284835224,
        4246832056,
        1258075500,
        768725851,
        2589189241,
        3069724005,
        3532540348,
        1274779536,
        3789419226,
        2764799539,
        1660621633,
        3471099624,
        4011903706,
        913787905,
        3497959166,
        737222580,
        2514213453,
        2928710040,
        3937242737,
        1804850592,
        3499020752,
        2949064160,
        2386320175,
        2390070455,
        2415321851,
        4061277028,
        2290661394,
        2416832540,
        1336762016,
        1754252060,
        3520065937,
        3014181293,
        791618072,
        3188594551,
        3933548030,
        2332172193,
        3852520463,
        3043980520,
        413987798,
        3465142937,
        3030929376,
        4245938359,
        2093235073,
        3534596313,
        375366246,
        2157278981,
        2479649556,
        555357303,
        3870105701,
        2008414854,
        3344188149,
        4221384143,
        3956125452,
        2067696032,
        3594591187,
        2921233993,
        2428461,
        544322398,
        577241275,
        1471733935,
        610547355,
        4027169054,
        1432588573,
        1507829418,
        2025931657,
        3646575487,
        545086370,
        48609733,
        2200306550,
        1653985193,
        298326376,
        1316178497,
        3007786442,
        2064951626,
        458293330,
        2589141269,
        3591329599,
        3164325604,
        727753846,
        2179363840,
        146436021,
        1461446943,
        4069977195,
        705550613,
        3059967265,
        3887724982,
        4281599278,
        3313849956,
        1404054877,
        2845806497,
        146425753,
        1854211946,
        1266315497,
        3048417604,
        3681880366,
        3289982499,
        290971e4,
        1235738493,
        2632868024,
        2414719590,
        3970600049,
        1771706367,
        1449415276,
        3266420449,
        422970021,
        1963543593,
        2690192192,
        3826793022,
        1062508698,
        1531092325,
        1804592342,
        2583117782,
        2714934279,
        4024971509,
        1294809318,
        4028980673,
        1289560198,
        2221992742,
        1669523910,
        35572830,
        157838143,
        1052438473,
        1016535060,
        1802137761,
        1753167236,
        1386275462,
        3080475397,
        2857371447,
        1040679964,
        2145300060,
        2390574316,
        1461121720,
        2956646967,
        4031777805,
        4028374788,
        33600511,
        2920084762,
        1018524850,
        629373528,
        3691585981,
        3515945977,
        2091462646,
        2486323059,
        586499841,
        988145025,
        935516892,
        3367335476,
        2599673255,
        2839830854,
        265290510,
        3972581182,
        2759138881,
        3795373465,
        1005194799,
        847297441,
        406762289,
        1314163512,
        1332590856,
        1866599683,
        4127851711,
        750260880,
        613907577,
        1450815602,
        3165620655,
        3734664991,
        3650291728,
        3012275730,
        3704569646,
        1427272223,
        778793252,
        1343938022,
        2676280711,
        2052605720,
        1946737175,
        3164576444,
        3914038668,
        3967478842,
        3682934266,
        1661551462,
        3294938066,
        4011595847,
        840292616,
        3712170807,
        616741398,
        312560963,
        711312465,
        1351876610,
        322626781,
        1910503582,
        271666773,
        2175563734,
        1594956187,
        70604529,
        3617834859,
        1007753275,
        1495573769,
        4069517037,
        2549218298,
        2663038764,
        504708206,
        2263041392,
        3941167025,
        2249088522,
        1514023603,
        1998579484,
        1312622330,
        694541497,
        2582060303,
        2151582166,
        1382467621,
        776784248,
        2618340202,
        3323268794,
        2497899128,
        2784771155,
        503983604,
        4076293799,
        907881277,
        423175695,
        432175456,
        1378068232,
        4145222326,
        3954048622,
        3938656102,
        3820766613,
        2793130115,
        2977904593,
        26017576,
        3274890735,
        3194772133,
        1700274565,
        1756076034,
        4006520079,
        3677328699,
        720338349,
        1533947780,
        354530856,
        688349552,
        3973924725,
        1637815568,
        332179504,
        3949051286,
        53804574,
        2852348879,
        3044236432,
        1282449977,
        3583942155,
        3416972820,
        4006381244,
        1617046695,
        2628476075,
        3002303598,
        1686838959,
        431878346,
        2686675385,
        1700445008,
        1080580658,
        1009431731,
        832498133,
        3223435511,
        2605976345,
        2271191193,
        2516031870,
        1648197032,
        4164389018,
        2548247927,
        300782431,
        375919233,
        238389289,
        3353747414,
        2531188641,
        2019080857,
        1475708069,
        455242339,
        2609103871,
        448939670,
        3451063019,
        1395535956,
        2413381860,
        1841049896,
        1491858159,
        885456874,
        4264095073,
        4001119347,
        1565136089,
        3898914787,
        1108368660,
        540939232,
        1173283510,
        2745871338,
        3681308437,
        4207628240,
        3343053890,
        4016749493,
        1699691293,
        1103962373,
        3625875870,
        2256883143,
        3830138730,
        1031889488,
        3479347698,
        1535977030,
        4236805024,
        3251091107,
        2132092099,
        1774941330,
        1199868427,
        1452454533,
        157007616,
        2904115357,
        342012276,
        595725824,
        1480756522,
        206960106,
        497939518,
        591360097,
        863170706,
        2375253569,
        3596610801,
        1814182875,
        2094937945,
        3421402208,
        1082520231,
        3463918190,
        2785509508,
        435703966,
        3908032597,
        1641649973,
        2842273706,
        3305899714,
        1510255612,
        2148256476,
        2655287854,
        3276092548,
        4258621189,
        236887753,
        3681803219,
        274041037,
        1734335097,
        3815195456,
        3317970021,
        1899903192,
        1026095262,
        4050517792,
        356393447,
        2410691914,
        3873677099,
        3682840055,
        3913112168,
        2491498743,
        4132185628,
        2489919796,
        1091903735,
        1979897079,
        3170134830,
        3567386728,
        3557303409,
        857797738,
        1136121015,
        1342202287,
        507115054,
        2535736646,
        337727348,
        3213592640,
        1301675037,
        2528481711,
        1895095763,
        1721773893,
        3216771564,
        62756741,
        2142006736,
        835421444,
        2531993523,
        1442658625,
        3659876326,
        2882144922,
        676362277,
        1392781812,
        170690266,
        3921047035,
        1759253602,
        3611846912,
        1745797284,
        664899054,
        1329594018,
        3901205900,
        3045908486,
        2062866102,
        2865634940,
        3543621612,
        3464012697,
        1080764994,
        553557557,
        3656615353,
        3996768171,
        991055499,
        499776247,
        1265440854,
        648242737,
        3940784050,
        980351604,
        3713745714,
        1749149687,
        3396870395,
        4211799374,
        3640570775,
        1161844396,
        3125318951,
        1431517754,
        545492359,
        4268468663,
        3499529547,
        1437099964,
        2702547544,
        3433638243,
        2581715763,
        2787789398,
        1060185593,
        1593081372,
        2418618748,
        4260947970,
        69676912,
        2159744348,
        86519011,
        2512459080,
        3838209314,
        1220612927,
        3339683548,
        133810670,
        1090789135,
        1078426020,
        1569222167,
        845107691,
        3583754449,
        4072456591,
        1091646820,
        628848692,
        1613405280,
        3757631651,
        526609435,
        236106946,
        48312990,
        2942717905,
        3402727701,
        1797494240,
        859738849,
        992217954,
        4005476642,
        2243076622,
        3870952857,
        3732016268,
        765654824,
        3490871365,
        2511836413,
        1685915746,
        3888969200,
        1414112111,
        2273134842,
        3281911079,
        4080962846,
        172450625,
        2569994100,
        980381355,
        4109958455,
        2819808352,
        2716589560,
        2568741196,
        3681446669,
        3329971472,
        1835478071,
        660984891,
        3704678404,
        4045999559,
        3422617507,
        3040415634,
        1762651403,
        1719377915,
        3470491036,
        2693910283,
        3642056355,
        3138596744,
        1364962596,
        2073328063,
        1983633131,
        926494387,
        3423689081,
        2150032023,
        4096667949,
        1749200295,
        3328846651,
        309677260,
        2016342300,
        1779581495,
        3079819751,
        111262694,
        1274766160,
        443224088,
        298511866,
        1025883608,
        3806446537,
        1145181785,
        168956806,
        3641502830,
        3584813610,
        1689216846,
        3666258015,
        3200248200,
        1692713982,
        2646376535,
        4042768518,
        1618508792,
        1610833997,
        3523052358,
        4130873264,
        2001055236,
        3610705100,
        2202168115,
        4028541809,
        2961195399,
        1006657119,
        2006996926,
        3186142756,
        1430667929,
        3210227297,
        1314452623,
        4074634658,
        4101304120,
        2273951170,
        1399257539,
        3367210612,
        3027628629,
        1190975929,
        2062231137,
        2333990788,
        2221543033,
        2438960610,
        1181637006,
        548689776,
        2362791313,
        3372408396,
        3104550113,
        3145860560,
        296247880,
        1970579870,
        3078560182,
        3769228297,
        1714227617,
        3291629107,
        3898220290,
        166772364,
        1251581989,
        493813264,
        448347421,
        195405023,
        2709975567,
        677966185,
        3703036547,
        1463355134,
        2715995803,
        1338867538,
        1343315457,
        2802222074,
        2684532164,
        233230375,
        2599980071,
        2000651841,
        3277868038,
        1638401717,
        4028070440,
        3237316320,
        6314154,
        819756386,
        300326615,
        590932579,
        1405279636,
        3267499572,
        3150704214,
        2428286686,
        3959192993,
        3461946742,
        1862657033,
        1266418056,
        963775037,
        2089974820,
        2263052895,
        1917689273,
        448879540,
        3550394620,
        3981727096,
        150775221,
        3627908307,
        1303187396,
        508620638,
        2975983352,
        2726630617,
        1817252668,
        1876281319,
        1457606340,
        908771278,
        3720792119,
        3617206836,
        2455994898,
        1729034894,
        1080033504,
        976866871,
        3556439503,
        2881648439,
        1522871579,
        1555064734,
        1336096578,
        3548522304,
        2579274686,
        3574697629,
        3205460757,
        3593280638,
        3338716283,
        3079412587,
        564236357,
        2993598910,
        1781952180,
        1464380207,
        3163844217,
        3332601554,
        1699332808,
        1393555694,
        1183702653,
        3581086237,
        1288719814,
        691649499,
        2847557200,
        2895455976,
        3193889540,
        2717570544,
        1781354906,
        1676643554,
        2592534050,
        3230253752,
        1126444790,
        2770207658,
        2633158820,
        2210423226,
        2615765581,
        2414155088,
        3127139286,
        673620729,
        2805611233,
        1269405062,
        4015350505,
        3341807571,
        4149409754,
        1057255273,
        2012875353,
        2162469141,
        2276492801,
        2601117357,
        993977747,
        3918593370,
        2654263191,
        753973209,
        36408145,
        2530585658,
        25011837,
        3520020182,
        2088578344,
        530523599,
        2918365339,
        1524020338,
        1518925132,
        3760827505,
        3759777254,
        1202760957,
        3985898139,
        3906192525,
        674977740,
        4174734889,
        2031300136,
        2019492241,
        3983892565,
        4153806404,
        3822280332,
        352677332,
        2297720250,
        60907813,
        90501309,
        3286998549,
        1016092578,
        2535922412,
        2839152426,
        457141659,
        509813237,
        4120667899,
        652014361,
        1966332200,
        2975202805,
        55981186,
        2327461051,
        676427537,
        3255491064,
        2882294119,
        3433927263,
        1307055953,
        942726286,
        933058658,
        2468411793,
        3933900994,
        4215176142,
        1361170020,
        2001714738,
        2830558078,
        3274259782,
        1222529897,
        1679025792,
        2729314320,
        3714953764,
        1770335741,
        151462246,
        3013232138,
        1682292957,
        1483529935,
        471910574,
        1539241949,
        458788160,
        3436315007,
        1807016891,
        3718408830,
        978976581,
        1043663428,
        3165965781,
        1927990952,
        4200891579,
        2372276910,
        3208408903,
        3533431907,
        1412390302,
        2931980059,
        4132332400,
        1947078029,
        3881505623,
        4168226417,
        2941484381,
        1077988104,
        1320477388,
        886195818,
        18198404,
        3786409e3,
        2509781533,
        112762804,
        3463356488,
        1866414978,
        891333506,
        18488651,
        661792760,
        1628790961,
        3885187036,
        3141171499,
        876946877,
        2693282273,
        1372485963,
        791857591,
        2686433993,
        3759982718,
        3167212022,
        3472953795,
        2716379847,
        445679433,
        3561995674,
        3504004811,
        3574258232,
        54117162,
        3331405415,
        2381918588,
        3769707343,
        4154350007,
        1140177722,
        4074052095,
        668550556,
        3214352940,
        367459370,
        261225585,
        2610173221,
        4209349473,
        3468074219,
        3265815641,
        314222801,
        3066103646,
        3808782860,
        282218597,
        3406013506,
        3773591054,
        379116347,
        1285071038,
        846784868,
        2669647154,
        3771962079,
        3550491691,
        2305946142,
        453669953,
        1268987020,
        3317592352,
        3279303384,
        3744833421,
        2610507566,
        3859509063,
        266596637,
        3847019092,
        517658769,
        3462560207,
        3443424879,
        370717030,
        4247526661,
        2224018117,
        4143653529,
        4112773975,
        2788324899,
        2477274417,
        1456262402,
        2901442914,
        1517677493,
        1846949527,
        2295493580,
        3734397586,
        2176403920,
        1280348187,
        1908823572,
        3871786941,
        846861322,
        1172426758,
        3287448474,
        3383383037,
        1655181056,
        3139813346,
        901632758,
        1897031941,
        2986607138,
        3066810236,
        3447102507,
        1393639104,
        373351379,
        950779232,
        625454576,
        3124240540,
        4148612726,
        2007998917,
        544563296,
        2244738638,
        2330496472,
        2058025392,
        1291430526,
        424198748,
        50039436,
        29584100,
        3605783033,
        2429876329,
        2791104160,
        1057563949,
        3255363231,
        3075367218,
        3463963227,
        1469046755,
        985887462
      ];
      var C_ORIG = [
        1332899944,
        1700884034,
        1701343084,
        1684370003,
        1668446532,
        1869963892
      ];
      function _encipher(lr, off, P, S) {
        var n, l = lr[off], r = lr[off + 1];
        l ^= P[0];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[1];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[2];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[3];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[4];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[5];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[6];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[7];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[8];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[9];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[10];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[11];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[12];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[13];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[14];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[15];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[16];
        lr[off] = r ^ P[BLOWFISH_NUM_ROUNDS + 1];
        lr[off + 1] = l;
        return lr;
      }
      __name(_encipher, "_encipher");
      function _streamtoword(data, offp) {
        for (var i = 0, word = 0; i < 4; ++i)
          word = word << 8 | data[offp] & 255, offp = (offp + 1) % data.length;
        return { key: word, offp };
      }
      __name(_streamtoword, "_streamtoword");
      function _key(key, P, S) {
        var offset = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
        for (var i = 0; i < plen; i++)
          sw = _streamtoword(key, offset), offset = sw.offp, P[i] = P[i] ^ sw.key;
        for (i = 0; i < plen; i += 2)
          lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
        for (i = 0; i < slen; i += 2)
          lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
      }
      __name(_key, "_key");
      function _ekskey(data, key, P, S) {
        var offp = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
        for (var i = 0; i < plen; i++)
          sw = _streamtoword(key, offp), offp = sw.offp, P[i] = P[i] ^ sw.key;
        offp = 0;
        for (i = 0; i < plen; i += 2)
          sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
        for (i = 0; i < slen; i += 2)
          sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
      }
      __name(_ekskey, "_ekskey");
      function _crypt(b, salt, rounds, callback, progressCallback) {
        var cdata = C_ORIG.slice(), clen = cdata.length, err;
        if (rounds < 4 || rounds > 31) {
          err = Error("Illegal number of rounds (4-31): " + rounds);
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else
            throw err;
        }
        if (salt.length !== BCRYPT_SALT_LEN) {
          err = Error("Illegal salt length: " + salt.length + " != " + BCRYPT_SALT_LEN);
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else
            throw err;
        }
        rounds = 1 << rounds >>> 0;
        var P, S, i = 0, j;
        if (Int32Array) {
          P = new Int32Array(P_ORIG);
          S = new Int32Array(S_ORIG);
        } else {
          P = P_ORIG.slice();
          S = S_ORIG.slice();
        }
        _ekskey(salt, b, P, S);
        function next() {
          if (progressCallback)
            progressCallback(i / rounds);
          if (i < rounds) {
            var start = Date.now();
            for (; i < rounds; ) {
              i = i + 1;
              _key(b, P, S);
              _key(salt, P, S);
              if (Date.now() - start > MAX_EXECUTION_TIME)
                break;
            }
          } else {
            for (i = 0; i < 64; i++)
              for (j = 0; j < clen >> 1; j++)
                _encipher(cdata, j << 1, P, S);
            var ret = [];
            for (i = 0; i < clen; i++)
              ret.push((cdata[i] >> 24 & 255) >>> 0), ret.push((cdata[i] >> 16 & 255) >>> 0), ret.push((cdata[i] >> 8 & 255) >>> 0), ret.push((cdata[i] & 255) >>> 0);
            if (callback) {
              callback(null, ret);
              return;
            } else
              return ret;
          }
          if (callback)
            nextTick(next);
        }
        __name(next, "next");
        if (typeof callback !== "undefined") {
          next();
        } else {
          var res;
          while (true)
            if (typeof (res = next()) !== "undefined")
              return res || [];
        }
      }
      __name(_crypt, "_crypt");
      function _hash(s, salt, callback, progressCallback) {
        var err;
        if (typeof s !== "string" || typeof salt !== "string") {
          err = Error("Invalid string / salt: Not a string");
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else
            throw err;
        }
        var minor, offset;
        if (salt.charAt(0) !== "$" || salt.charAt(1) !== "2") {
          err = Error("Invalid salt version: " + salt.substring(0, 2));
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else
            throw err;
        }
        if (salt.charAt(2) === "$")
          minor = String.fromCharCode(0), offset = 3;
        else {
          minor = salt.charAt(2);
          if (minor !== "a" && minor !== "b" && minor !== "y" || salt.charAt(3) !== "$") {
            err = Error("Invalid salt revision: " + salt.substring(2, 4));
            if (callback) {
              nextTick(callback.bind(this, err));
              return;
            } else
              throw err;
          }
          offset = 4;
        }
        if (salt.charAt(offset + 2) > "$") {
          err = Error("Missing salt rounds");
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else
            throw err;
        }
        var r1 = parseInt(salt.substring(offset, offset + 1), 10) * 10, r2 = parseInt(salt.substring(offset + 1, offset + 2), 10), rounds = r1 + r2, real_salt = salt.substring(offset + 3, offset + 25);
        s += minor >= "a" ? "\0" : "";
        var passwordb = stringToBytes(s), saltb = base64_decode(real_salt, BCRYPT_SALT_LEN);
        function finish(bytes) {
          var res = [];
          res.push("$2");
          if (minor >= "a")
            res.push(minor);
          res.push("$");
          if (rounds < 10)
            res.push("0");
          res.push(rounds.toString());
          res.push("$");
          res.push(base64_encode(saltb, saltb.length));
          res.push(base64_encode(bytes, C_ORIG.length * 4 - 1));
          return res.join("");
        }
        __name(finish, "finish");
        if (typeof callback == "undefined")
          return finish(_crypt(passwordb, saltb, rounds));
        else {
          _crypt(passwordb, saltb, rounds, function(err2, bytes) {
            if (err2)
              callback(err2, null);
            else
              callback(null, finish(bytes));
          }, progressCallback);
        }
      }
      __name(_hash, "_hash");
      bcrypt2.encodeBase64 = base64_encode;
      bcrypt2.decodeBase64 = base64_decode;
      return bcrypt2;
    });
  }
});

// src/worker.mjs
var import_bcryptjs = __toESM(require_bcrypt(), 1);

// src/d1-resilience.mjs
var RETRYABLE_D1_ERROR_PATTERNS = [
  /network connection lost/i,
  /reset because its code was updated/i,
  /internal error while starting up d1 db storage caused object to be reset/i,
  /d1 db storage caused object to be reset/i,
  /cannot resolve d1 db due to transient issue/i
];
var UNAVAILABLE_D1_ERROR_PATTERNS = [
  ...RETRYABLE_D1_ERROR_PATTERNS,
  /d1 db is overloaded/i,
  /d1 db storage operation exceeded timeout/i,
  /d1 db(?:'s)? isolate exceeded its memory limit/i,
  /d1 db exceeded its cpu time limit/i
];
function collectErrorMessages(error) {
  const messages = [];
  const seen = /* @__PURE__ */ new Set();
  let current = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (typeof current === "string") {
      messages.push(current);
      break;
    }
    if (current?.message) messages.push(String(current.message));
    current = current?.cause;
  }
  if (!messages.length && error !== void 0 && error !== null) {
    messages.push(String(error));
  }
  return messages;
}
__name(collectErrorMessages, "collectErrorMessages");
function getD1ErrorMessage(error) {
  return collectErrorMessages(error).join(" | ");
}
__name(getD1ErrorMessage, "getD1ErrorMessage");
function isRetryableD1Error(error) {
  const message = getD1ErrorMessage(error);
  return RETRYABLE_D1_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}
__name(isRetryableD1Error, "isRetryableD1Error");
function isD1UnavailableError(error) {
  const message = getD1ErrorMessage(error);
  return UNAVAILABLE_D1_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}
__name(isD1UnavailableError, "isD1UnavailableError");
var D1WriteOutcomeUnknownError = class extends Error {
  static {
    __name(this, "D1WriteOutcomeUnknownError");
  }
  constructor(operation, cause) {
    super("O resultado da grava\xE7\xE3o no D1 n\xE3o p\xF4de ser confirmado", { cause });
    this.name = "D1WriteOutcomeUnknownError";
    this.code = "DATABASE_WRITE_OUTCOME_UNKNOWN";
    this.operation = operation;
  }
};
function isD1WriteOutcomeUnknownError(error) {
  return error instanceof D1WriteOutcomeUnknownError || error?.code === "DATABASE_WRITE_OUTCOME_UNKNOWN";
}
__name(isD1WriteOutcomeUnknownError, "isD1WriteOutcomeUnknownError");
function protectD1WriteOutcome(operation, error) {
  if (isD1UnavailableError(error)) {
    return new D1WriteOutcomeUnknownError(operation, error);
  }
  return error;
}
__name(protectD1WriteOutcome, "protectD1WriteOutcome");
function secureJitter(maxExclusive) {
  if (maxExclusive <= 1) return 0;
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % maxExclusive;
}
__name(secureJitter, "secureJitter");
function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
__name(wait, "wait");
async function withD1Retry(operation, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts) || 6);
  const baseDelayMs = Math.max(0, Number(options.baseDelayMs) || 50);
  const maxDelayMs = Math.max(baseDelayMs, Number(options.maxDelayMs) || 800);
  const sleep = options.sleep || wait;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (!isRetryableD1Error(error) || attempt >= maxAttempts) {
        throw error;
      }
      const exponentialCeiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = secureJitter(exponentialCeiling + 1);
      if (typeof options.onRetry === "function") {
        await options.onRetry({ attempt, delayMs, error });
      }
      await sleep(delayMs);
    }
  }
  throw new Error("Retentativa D1 encerrada sem resultado");
}
__name(withD1Retry, "withD1Retry");
function isRetrySafeSql(sql) {
  const normalized = String(sql || "").replace(/^\s*(?:--[^\n]*\n\s*)*/g, "").trim().toUpperCase();
  return normalized.startsWith("SELECT ") || normalized.startsWith("EXPLAIN ") || /^PRAGMA\s+(?:TABLE_INFO|TABLE_XINFO|INDEX_LIST|INDEX_INFO|INDEX_XINFO|FOREIGN_KEY_LIST)\s*\(/.test(normalized) || /^CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\b/.test(normalized);
}
__name(isRetrySafeSql, "isRetrySafeSql");

// src/quote-services.json
var quote_services_default = [
  {
    id: "projetor-6000-laser",
    name: "PROJETOR DE 6000 LASER",
    unitPrice: 1e3
  },
  {
    id: "projetor-7000-laser",
    name: "PROJETOR DE 7000 LASER",
    unitPrice: 1400
  },
  {
    id: "painel-de-led",
    name: "PAINEL DE LED",
    unitPrice: 500,
    requiresDimensions: true,
    pricePerSquareMeter: 500
  },
  {
    id: "totem-de-led",
    name: "TOTEM DE LED",
    unitPrice: 0,
    editablePrice: true
  },
  {
    id: "fotografo",
    name: "FOT\xD3GRAFO",
    unitPrice: 1600
  },
  {
    id: "videomaker",
    name: "VIDEOMAKER",
    unitPrice: 2500
  },
  {
    id: "video-ate-1-minuto",
    name: "V\xCDDEO AT\xC9 1 MINUTO",
    unitPrice: 1800
  },
  {
    id: "video-ate-3-minutos",
    name: "V\xCDDEO AT\xC9 3 MINUTOS",
    unitPrice: 3e3
  },
  {
    id: "video-ate-8-minutos",
    name: "V\xCDDEO AT\xC9 8 MINUTOS",
    unitPrice: 6e3
  },
  {
    id: "internet-dedicado-100mb",
    name: "LINK DE INTERNET DEDICADO 100MB",
    unitPrice: 2200
  },
  {
    id: "internet-dedicado-500mb",
    name: "LINK DE INTERNET DEDICADO 500MB",
    unitPrice: 3500
  },
  {
    id: "starlink-backup",
    name: "LINK DE INTERNET STARLINK BACKUP",
    unitPrice: 1e3
  },
  {
    id: "tecnico-sonorizacao",
    name: "T\xC9CNICO DE SONORIZA\xC7\xC3O",
    unitPrice: 600
  },
  {
    id: "tecnico-video",
    name: "T\xC9CNICO DE V\xCDDEO",
    unitPrice: 600
  },
  {
    id: "tecnico-iluminacao",
    name: "T\xC9CNICO DE ILUMINA\xC7\xC3O",
    unitPrice: 600
  },
  {
    id: "tecnico-streaming",
    name: "T\xC9CNICO DE STREAMING",
    unitPrice: 1e3
  }
];

// src/worker-quotes.mjs
var QUOTE_CATEGORIES = /* @__PURE__ */ new Set([
  "sonorizacao",
  "transmissao",
  "iluminacao",
  "internet",
  "outros"
]);
var USER_ROLES = /* @__PURE__ */ new Set(["admin", "user", "comercial"]);
var QUOTE_SERVICE_CATEGORY = "SERVI\xC7OS";
var QUOTE_SERVICE_BY_ID = new Map(quote_services_default.map((service) => [service.id, service]));
var D1_LEDGER_CONFLICT_MESSAGES = Object.freeze({
  D1_LEDGER_EQUIPMENT_NOT_FOUND: "Equipamento n\xE3o encontrado.",
  D1_LEDGER_EVENT_NOT_FOUND: "Evento n\xE3o encontrado.",
  D1_LEDGER_SPACE_EVENT_MISMATCH: "O espa\xE7o informado n\xE3o pertence a este evento.",
  D1_LEDGER_EQUIPMENT_MAINTENANCE: "Este equipamento est\xE1 em manuten\xE7\xE3o.",
  D1_LEDGER_EQUIPMENT_ALREADY_OUT: "Este equipamento j\xE1 possui uma sa\xEDda pendente.",
  D1_LEDGER_EQUIPMENT_RETURN_EXCEEDS_PENDING: "Este equipamento n\xE3o possui sa\xEDda pendente neste evento e espa\xE7o.",
  D1_LEDGER_CABLE_QUANTITY_INVALID: "Informe uma quantidade v\xE1lida de cabo.",
  D1_LEDGER_CABLE_NOT_FOUND: "Cabo n\xE3o encontrado.",
  D1_LEDGER_CABLE_INSUFFICIENT_STOCK: "Quantidade de cabo insuficiente em estoque.",
  D1_LEDGER_CABLE_RETURN_EXCEEDS_PENDING: "A entrada de cabo ultrapassa a sa\xEDda pendente neste evento e espa\xE7o.",
  D1_LEDGER_CABLE_BALANCE_ABOVE_TOTAL: "A entrada de cabo ultrapassaria a quantidade total cadastrada.",
  D1_LEDGER_OTHER_ITEM_QUANTITY_INVALID: "Informe uma quantidade v\xE1lida do item.",
  D1_LEDGER_OTHER_ITEM_NOT_FOUND: "Item n\xE3o encontrado.",
  D1_LEDGER_OTHER_ITEM_INSUFFICIENT_STOCK: "Quantidade insuficiente deste item em estoque.",
  D1_LEDGER_OTHER_ITEM_RETURN_EXCEEDS_PENDING: "A entrada do item ultrapassa a sa\xEDda pendente neste evento e espa\xE7o.",
  D1_LEDGER_OTHER_ITEM_BALANCE_ABOVE_TOTAL: "A entrada do item ultrapassaria a quantidade total cadastrada.",
  D1_LEDGER_MANUAL_ITEM_QUANTITY_INVALID: "Informe uma quantidade v\xE1lida do equipamento avulso.",
  D1_LEDGER_MANUAL_ITEM_EVENT_MISMATCH: "Equipamento avulso n\xE3o encontrado neste evento.",
  D1_LEDGER_MANUAL_ITEM_CAPACITY_EXCEEDED: "A sa\xEDda ultrapassa a quantidade informada no or\xE7amento.",
  D1_LEDGER_MANUAL_ITEM_RETURN_EXCEEDS_PENDING: "A entrada ultrapassa a sa\xEDda pendente deste equipamento avulso no espa\xE7o.",
  D1_LEDGER_QUOTE_LOCKED_BY_MOVEMENT: "Este or\xE7amento possui movimenta\xE7\xF5es e n\xE3o pode ser alterado ou exclu\xEDdo.",
  D1_LEDGER_QUOTE_LOCKED_BY_PAYMENT: "Este or\xE7amento possui pagamento de t\xE9cnico e n\xE3o pode ser alterado ou exclu\xEDdo.",
  D1_BALANCE_CABLE_TOTAL_NEGATIVE: "A quantidade total de cabo n\xE3o pode ser negativa.",
  D1_BALANCE_CABLE_NEGATIVE: "A quantidade dispon\xEDvel de cabo n\xE3o pode ficar negativa.",
  D1_BALANCE_CABLE_ABOVE_TOTAL: "A quantidade dispon\xEDvel de cabo n\xE3o pode ultrapassar o total cadastrado.",
  D1_BALANCE_OTHER_ITEM_TOTAL_NEGATIVE: "A quantidade total do item n\xE3o pode ser negativa.",
  D1_BALANCE_OTHER_ITEM_NEGATIVE: "A quantidade dispon\xEDvel do item n\xE3o pode ficar negativa.",
  D1_BALANCE_OTHER_ITEM_ABOVE_TOTAL: "A quantidade dispon\xEDvel do item n\xE3o pode ultrapassar o total cadastrado."
});
async function handleQuoteRequest({ request, env, executionCtx, session, url, helpers = {} }) {
  const requestUrl = url instanceof URL ? url : new URL(request.url);
  const { pathname } = requestUrl;
  const route = matchQuoteRoute(pathname, request.method);
  if (!route) return null;
  const sendJson = helpers.json || json;
  if (!session) {
    return sendJson({ error: "N\xE3o autorizado" }, 401);
  }
  const db = createDb(env, helpers);
  try {
    if (route.access === "quote" && !canAccessQuotes(session)) {
      return sendJson({ error: "Acesso restrito \xE0 tela de or\xE7amentos" }, 403);
    }
    if (route.access === "admin" && !isAdminSession(session)) {
      return sendJson({ error: "Acesso restrito a administradores" }, 403);
    }
    switch (route.name) {
      case "quote-equipment-database":
        return await handleQuoteEquipmentDatabase(db, requestUrl, sendJson);
      case "quote-equipment-visibility":
        return await handleQuoteEquipmentVisibility(db, session, route.params, sendJson);
      case "quote-equipment-group-name":
        return await handleQuoteEquipmentGroupName(db, request, helpers, sendJson);
      case "quote-equipment-topic-name":
        return await handleQuoteEquipmentTopicName(db, request, helpers, sendJson);
      case "quote-equipment-group-price":
        return await handleQuoteEquipmentGroupPrice(db, request, helpers, sendJson);
      case "quote-service-price":
        return await handleQuoteServicePrice(db, request, route.params, helpers, sendJson);
      case "quote-equipment-group-visibility":
        return await handleQuoteEquipmentGroupVisibility(db, request, session, route.params, helpers, sendJson);
      case "quote-equipment-available":
        return await handleAvailableQuoteEquipments(db, requestUrl, sendJson);
      case "quote-equipment-schedule":
        return await handleQuoteEquipmentSchedule(db, request, route.params, helpers, sendJson);
      case "quote-equipment-release":
        return await handleQuoteEquipmentRelease(db, route.params, sendJson);
      case "quote-technicians":
        return await handleQuoteTechnicians(db, requestUrl, sendJson);
      case "quote-date-conflicts":
        return await handleQuoteDateConflicts(db, requestUrl, sendJson);
      case "quote-payments":
        return await handleQuotePayments(db, sendJson);
      case "quote-payment-paid":
        return await handleQuotePaymentPaid(db, session, route.params, sendJson);
      case "quote-payment-correct":
        return await handleQuotePaymentCorrect(db, route.params, sendJson);
      case "quote-list":
        return await handleQuoteList(db, requestUrl, sendJson);
      case "quote-create":
        return await handleQuoteCreate(db, request, session, helpers, sendJson);
      case "quote-ready":
        return await handleQuoteReady(db, route.params, sendJson);
      case "quote-delete":
        return await handleQuoteDelete(db, route.params, sendJson);
      case "quote-get":
        return await handleQuoteGet(db, route.params, sendJson);
      case "quote-update":
        return await handleQuoteUpdate(db, request, route.params, helpers, sendJson);
      case "quote-pdf":
        return await handleQuotePdf(db, request, env, executionCtx, route.params, sendJson);
      case "scheduled-events":
        return await handleScheduledEvents(db, sendJson);
      case "quote-manual-summary":
        return await handleQuoteManualSummary(db, route.params, sendJson);
      case "quote-manual-movement":
        return await handleQuoteManualMovement(db, request, route.params, helpers, sendJson);
      default:
        return null;
    }
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    const ledgerConflict = getD1LedgerConflict(error);
    if (ledgerConflict) {
      return sendJson({
        code: ledgerConflict.code,
        error: ledgerConflict.message,
        message: ledgerConflict.message,
        retryable: false
      }, 409, { "Cache-Control": "no-store" });
    }
    if (isD1WriteOutcomeUnknownError(error)) {
      const requestId = request.headers.get("cf-ray") || crypto.randomUUID();
      console.error(JSON.stringify({
        message: "quote database write outcome unknown",
        method: request.method,
        path: pathname,
        requestId,
        operation: error?.operation || null,
        error: getD1ErrorMessage(error?.cause || error)
      }));
      return sendJson({
        code: "DATABASE_WRITE_OUTCOME_UNKNOWN",
        error: "A confirma\xE7\xE3o da grava\xE7\xE3o foi interrompida. Atualize a tela para conferir o resultado antes de repetir.",
        retryable: false,
        requestId
      }, 503, {
        "Cache-Control": "no-store",
        "X-Request-ID": requestId
      });
    }
    if (isD1UnavailableError(error)) {
      const requestId = request.headers.get("cf-ray") || crypto.randomUUID();
      const retryable = isRetryableD1Error(error);
      console.error(JSON.stringify({
        message: "quote database temporarily unavailable",
        method: request.method,
        path: pathname,
        requestId,
        error: getD1ErrorMessage(error)
      }));
      return sendJson({
        code: "DATABASE_TEMPORARILY_UNAVAILABLE",
        error: retryable ? "O banco de dados oscilou por alguns instantes. Tente novamente." : "O banco de dados est\xE1 temporariamente indispon\xEDvel. Confira o estado da opera\xE7\xE3o antes de repeti-la.",
        retryable,
        requestId
      }, 503, {
        "Cache-Control": "no-store",
        ...retryable ? { "Retry-After": "1" } : {},
        "X-Request-ID": requestId
      });
    }
    if (status >= 500) {
      console.error(JSON.stringify({
        message: "quote request failed",
        method: request.method,
        path: pathname,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
    return sendJson({ error: error?.message || "Erro interno do servidor" }, status);
  }
}
__name(handleQuoteRequest, "handleQuoteRequest");
function getD1LedgerConflict(error) {
  const code = getD1ErrorMessage(error).match(/\bD1_(?:LEDGER|BALANCE)_[A-Z0-9_]+\b/)?.[0];
  if (!code) return null;
  return {
    code,
    message: D1_LEDGER_CONFLICT_MESSAGES[code] || "A movimenta\xE7\xE3o foi recusada para preservar a consist\xEAncia do estoque."
  };
}
__name(getD1LedgerConflict, "getD1LedgerConflict");
function matchQuoteRoute(pathname, method) {
  if (pathname === "/api/orcamentos/equipamentos-banco" && method === "GET") {
    return { name: "quote-equipment-database", access: "admin", params: {} };
  }
  if (pathname === "/api/orcamentos/equipamentos-disponiveis" && method === "GET") {
    return { name: "quote-equipment-available", access: "quote", params: {} };
  }
  if (pathname === "/api/orcamentos/equipamentos-grupo/nome" && method === "PATCH") {
    return { name: "quote-equipment-group-name", access: "admin", params: {} };
  }
  if (pathname === "/api/orcamentos/topicos/nome" && method === "PATCH") {
    return { name: "quote-equipment-topic-name", access: "admin", params: {} };
  }
  if (pathname === "/api/orcamentos/equipamentos-grupo/preco" && method === "PATCH") {
    return { name: "quote-equipment-group-price", access: "admin", params: {} };
  }
  const servicePriceMatch = pathname.match(/^\/api\/orcamentos\/servicos\/([a-z0-9-]+)\/preco$/);
  if (servicePriceMatch && method === "PATCH") {
    return {
      name: "quote-service-price",
      access: "admin",
      params: { serviceId: servicePriceMatch[1] }
    };
  }
  let groupMatch = pathname.match(/^\/api\/orcamentos\/equipamentos-grupo\/(ocultar|restaurar)$/);
  if (groupMatch && method === "POST") {
    return {
      name: "quote-equipment-group-visibility",
      access: "admin",
      params: { action: groupMatch[1] }
    };
  }
  let match = pathname.match(/^\/api\/orcamentos\/equipamentos\/(\d+)\/(ocultar|restaurar)$/);
  if (match && method === "POST") {
    return {
      name: "quote-equipment-visibility",
      access: "admin",
      params: { equipmentId: Number(match[1]), action: match[2] }
    };
  }
  match = pathname.match(/^\/api\/orcamentos\/equipamentos\/(\d+)\/(agendar|liberar)$/);
  if (match && method === "POST") {
    return {
      name: match[2] === "agendar" ? "quote-equipment-schedule" : "quote-equipment-release",
      access: "quote",
      params: { equipmentId: Number(match[1]) }
    };
  }
  if (pathname === "/api/orcamentos/tecnicos" && method === "GET") {
    return { name: "quote-technicians", access: "quote", params: {} };
  }
  if (pathname === "/api/orcamentos/date-conflicts" && method === "GET") {
    return { name: "quote-date-conflicts", access: "quote", params: {} };
  }
  if (pathname === "/api/orcamentos/pagamentos" && method === "GET") {
    return { name: "quote-payments", access: "quote", params: {} };
  }
  match = pathname.match(/^\/api\/orcamentos\/pagamentos\/(\d+)\/(pago|corrigir)$/);
  if (match && method === "PATCH") {
    return {
      name: match[2] === "pago" ? "quote-payment-paid" : "quote-payment-correct",
      access: "quote",
      params: { paymentId: Number(match[1]) }
    };
  }
  if (pathname === "/api/orcamentos" && method === "GET") {
    return { name: "quote-list", access: "quote", params: {} };
  }
  if (pathname === "/api/orcamentos" && method === "POST") {
    return { name: "quote-create", access: "quote", params: {} };
  }
  match = pathname.match(/^\/api\/orcamentos\/(\d+)\/(pronto|aprovar)$/);
  if (match && (method === "PATCH" || method === "POST")) {
    return { name: "quote-ready", access: "quote", params: { quoteId: Number(match[1]) } };
  }
  match = pathname.match(/^\/api\/orcamentos\/(\d+)\/pdf$/);
  if (match && method === "GET") {
    return { name: "quote-pdf", access: "quote", params: { quoteId: Number(match[1]) } };
  }
  match = pathname.match(/^\/api\/orcamentos\/(\d+)$/);
  if (match && ["GET", "PATCH", "DELETE"].includes(method)) {
    const names = { GET: "quote-get", PATCH: "quote-update", DELETE: "quote-delete" };
    return { name: names[method], access: "quote", params: { quoteId: Number(match[1]) } };
  }
  if (pathname === "/api/scheduled-events" && method === "GET") {
    return { name: "scheduled-events", access: "auth", params: {} };
  }
  match = pathname.match(/^\/api\/events\/(\d+)\/quote-other-item-summary$/);
  if (match && method === "GET") {
    return { name: "quote-manual-summary", access: "auth", params: { eventId: Number(match[1]) } };
  }
  match = pathname.match(/^\/api\/quote-other-item-events\/(saida|entrada)$/);
  if (match && method === "POST") {
    return { name: "quote-manual-movement", access: "auth", params: { type: match[1] } };
  }
  return null;
}
__name(matchQuoteRoute, "matchQuoteRoute");
async function ensureAutomaticScheduledEvents(env, helpers = {}) {
  return ensureAutomaticScheduledEventsDb(createDb(env, helpers));
}
__name(ensureAutomaticScheduledEvents, "ensureAutomaticScheduledEvents");
async function findEquipmentDateConflict(env, equipmentId, currentRange, options = {}, helpers = {}) {
  return findEquipmentDateConflictDb(createDb(env, helpers), equipmentId, currentRange, options);
}
__name(findEquipmentDateConflict, "findEquipmentDateConflict");
async function findEquipmentGroupCapacityConflict(env, equipment, event, helpers = {}) {
  return findEquipmentGroupCapacityConflictDb(createDb(env, helpers), equipment, event);
}
__name(findEquipmentGroupCapacityConflict, "findEquipmentGroupCapacityConflict");
async function getEventEquipmentRequirements(env, eventId, helpers = {}) {
  return getEventEquipmentRequirementsDb(createDb(env, helpers), eventId);
}
__name(getEventEquipmentRequirements, "getEventEquipmentRequirements");
function createDb(env, helpers) {
  for (const name of ["queryAll", "queryFirst", "execute"]) {
    if (typeof helpers[name] !== "function") {
      throw new Error(`Helper D1 obrigat\xF3rio ausente: ${name}`);
    }
  }
  const queryAll2 = /* @__PURE__ */ __name((sql, params = []) => helpers.queryAll(env, sql, params), "queryAll");
  const queryFirst2 = /* @__PURE__ */ __name((sql, params = []) => helpers.queryFirst(env, sql, params), "queryFirst");
  const execute2 = /* @__PURE__ */ __name((sql, params = []) => helpers.execute(env, sql, params), "execute");
  const batch = /* @__PURE__ */ __name(async (operations) => {
    if (!operations.length) return [];
    if (typeof helpers.batch !== "function") {
      throw new Error("Helper D1 obrigat\xF3rio ausente: batch");
    }
    return helpers.batch(env, operations);
  }, "batch");
  return { queryAll: queryAll2, queryFirst: queryFirst2, execute: execute2, batch };
}
__name(createDb, "createDb");
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}
__name(json, "json");
function isAdminSession(session) {
  return normalizeUserRole(session?.role) === "admin";
}
__name(isAdminSession, "isAdminSession");
function canAccessQuotes(session) {
  const role = normalizeUserRole(session?.role);
  return role === "admin" || role === "comercial";
}
__name(canAccessQuotes, "canAccessQuotes");
function normalizeUserRole(role) {
  const normalized = String(role || "user").trim().toLowerCase();
  return USER_ROLES.has(normalized) ? normalized : "user";
}
__name(normalizeUserRole, "normalizeUserRole");
function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
__name(httpError, "httpError");
async function readRequestJson(request, helpers) {
  if (typeof helpers.readJson === "function") {
    return helpers.readJson(request);
  }
  try {
    return await request.json();
  } catch {
    return {};
  }
}
__name(readRequestJson, "readRequestJson");
function cleanText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}
__name(cleanText, "cleanText");
function parseBooleanFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return ["1", "true", "sim", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}
__name(parseBooleanFlag, "parseBooleanFlag");
function parseMoneyValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  const normalized = String(value || "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}
__name(parseMoneyValue, "parseMoneyValue");
function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
__name(roundMoney, "roundMoney");
function normalizeQuoteStatusText(status) {
  return String(status || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
__name(normalizeQuoteStatusText, "normalizeQuoteStatusText");
function normalizeQuoteServiceId(value) {
  return cleanText(value, 120).toLowerCase().replace(/^service:/, "").replace(/[^a-z0-9-]/g, "");
}
__name(normalizeQuoteServiceId, "normalizeQuoteServiceId");
function serializeQuoteService(service = {}, priceOverrides = /* @__PURE__ */ new Map()) {
  const serviceId = normalizeQuoteServiceId(service.id);
  const name = cleanText(service.name, 300).toUpperCase();
  const configuredPrice = service.editablePrice && priceOverrides.has(serviceId) ? priceOverrides.get(serviceId) : service.unitPrice;
  const unitPrice = roundMoney(parseMoneyValue(configuredPrice));
  const pricePerSquareMeter = service.requiresDimensions ? roundMoney(parseMoneyValue(service.pricePerSquareMeter ?? service.unitPrice)) : null;
  return {
    id: `service:${serviceId}`,
    serviceId,
    isService: true,
    unlimitedQuantity: true,
    editablePrice: service.editablePrice === true,
    requiresDimensions: service.requiresDimensions === true,
    pricePerSquareMeter,
    name,
    barcode: "",
    category: QUOTE_SERVICE_CATEGORY,
    categories: [QUOTE_SERVICE_CATEGORY],
    serialNumber: "",
    observation: "Quantidade ilimitada",
    currentStatus: "Dispon\xEDvel",
    unitPrice,
    minUnitPrice: unitPrice,
    maxUnitPrice: unitPrice,
    totalQuantity: null,
    availableQuantity: null,
    equipments: []
  };
}
__name(serializeQuoteService, "serializeQuoteService");
function getQuoteServiceSuggestions(search = "", priceOverrides = /* @__PURE__ */ new Map()) {
  const normalizedSearch = normalizeQuoteStatusText(search).replace(/\s+/g, " ");
  return quote_services_default.filter((service) => {
    if (!normalizedSearch) return true;
    const searchable = [
      QUOTE_SERVICE_CATEGORY,
      service.name,
      String(service.id || "").replace(/-/g, " ")
    ].map((value) => normalizeQuoteStatusText(value).replace(/\s+/g, " "));
    return searchable.some((value) => value.includes(normalizedSearch));
  }).map((service) => serializeQuoteService(service, priceOverrides));
}
__name(getQuoteServiceSuggestions, "getQuoteServiceSuggestions");
async function getQuoteServicePriceOverrides(db) {
  const rows = await db.queryAll(
    "SELECT service_id AS serviceId, unit_price AS unitPrice FROM quote_service_prices"
  );
  return new Map(rows.map((row) => [
    normalizeQuoteServiceId(row.serviceId),
    roundMoney(parseMoneyValue(row.unitPrice))
  ]));
}
__name(getQuoteServicePriceOverrides, "getQuoteServicePriceOverrides");
async function getQuoteServiceSuggestionsFromDatabase(db, search = "") {
  return getQuoteServiceSuggestions(search, await getQuoteServicePriceOverrides(db));
}
__name(getQuoteServiceSuggestionsFromDatabase, "getQuoteServiceSuggestionsFromDatabase");
function parseQuoteDimension(value) {
  const dimension = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(dimension) ? Math.round(dimension * 1e3) / 1e3 : NaN;
}
__name(parseQuoteDimension, "parseQuoteDimension");
function formatQuoteDimension(value) {
  return Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}
__name(formatQuoteDimension, "formatQuoteDimension");
function normalizeQuoteServiceItem(item, index = 0, priceOverrides = /* @__PURE__ */ new Map()) {
  const fallbackId = String(item?.id || "").startsWith("service:") ? item.id : "";
  const serviceId = normalizeQuoteServiceId(item?.serviceId ?? item?.service_id ?? fallbackId);
  const isService = parseBooleanFlag(item?.isService ?? item?.is_service) || !!serviceId;
  if (!isService) return null;
  const service = QUOTE_SERVICE_BY_ID.get(serviceId);
  if (!service) throw httpError("Servi\xE7o de or\xE7amento n\xE3o encontrado.", 404);
  const quantity = Number.parseInt(item?.quantity, 10);
  const dailyUnits = Number.parseInt(item?.dailyUnits ?? item?.daily_units, 10);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw httpError("Informe uma quantidade v\xE1lida para o servi\xE7o.", 400);
  }
  if (!Number.isInteger(dailyUnits) || dailyUnits <= 0) {
    throw httpError("Informe uma quantidade v\xE1lida de di\xE1rias para o servi\xE7o.", 400);
  }
  let serviceWidth = null;
  let serviceHeight = null;
  let description = cleanText(service.name, 300).toUpperCase();
  let internalUnitPrice;
  if (service.requiresDimensions) {
    serviceWidth = parseQuoteDimension(item?.serviceWidth ?? item?.service_width ?? item?.panelWidth);
    serviceHeight = parseQuoteDimension(item?.serviceHeight ?? item?.service_height ?? item?.panelHeight);
    if (!(serviceWidth > 0) || !(serviceHeight > 0)) {
      throw httpError("Informe largura e altura v\xE1lidas para o Painel de LED.", 400);
    }
    const squareMeterPrice = roundMoney(parseMoneyValue(service.pricePerSquareMeter ?? service.unitPrice));
    internalUnitPrice = roundMoney(serviceWidth * serviceHeight * squareMeterPrice);
    description = `${description} ${formatQuoteDimension(serviceWidth)}x${formatQuoteDimension(serviceHeight)} METROS`;
  } else {
    const configuredPrice = service.editablePrice && priceOverrides.has(serviceId) ? priceOverrides.get(serviceId) : service.unitPrice;
    internalUnitPrice = roundMoney(parseMoneyValue(configuredPrice));
  }
  return {
    equipmentId: null,
    serviceId,
    serviceWidth,
    serviceHeight,
    isManual: false,
    isService: true,
    category: QUOTE_SERVICE_CATEGORY,
    description,
    quantity,
    dailyUnits,
    internalUnitPrice,
    internalTotal: roundMoney(quantity * dailyUnits * internalUnitPrice),
    sortOrder: index + 1
  };
}
__name(normalizeQuoteServiceItem, "normalizeQuoteServiceItem");
function isQuoteEquipmentUsableStatus(status) {
  return !normalizeQuoteStatusText(status).includes("manut");
}
__name(isQuoteEquipmentUsableStatus, "isQuoteEquipmentUsableStatus");
function serializeQuoteEquipment(row = {}) {
  return {
    id: Number(row.id),
    name: row.name || "",
    barcode: row.barcode || "",
    category: row.category || "Outros",
    serialNumber: row.serialNumber || row.serial_number || "",
    observation: row.observation || "",
    currentStatus: row.currentStatus || row.current_status || "",
    unitPrice: roundMoney(parseMoneyValue(row.unitPrice ?? row.unit_price ?? 1))
  };
}
__name(serializeQuoteEquipment, "serializeQuoteEquipment");
function getQuoteEquipmentNameKey(value) {
  return normalizeQuoteStatusText(value).replace(/\s+/g, " ");
}
__name(getQuoteEquipmentNameKey, "getQuoteEquipmentNameKey");
function groupQuoteEquipmentsByName(equipments, unavailableIds = /* @__PURE__ */ new Set(), capacityByName = /* @__PURE__ */ new Map()) {
  const groups = /* @__PURE__ */ new Map();
  for (const equipment of equipments) {
    const key = getQuoteEquipmentNameKey(equipment?.name) || `equipment-${Number(equipment?.id) || 0}`;
    if (!groups.has(key)) {
      groups.set(key, {
        name: equipment.name || "Equipamento",
        equipments: [],
        availableEquipments: []
      });
    }
    const group = groups.get(key);
    group.equipments.push(equipment);
    if (!unavailableIds.has(Number(equipment.id))) {
      group.availableEquipments.push(equipment);
    }
  }
  return Array.from(groups.values()).map((group) => {
    const observations = [...new Set(
      group.equipments.map((equipment) => String(equipment.observation || "").trim()).filter(Boolean)
    )];
    const categories = [...new Set(
      group.equipments.map((equipment) => String(equipment.category || "Outros").trim() || "Outros")
    )];
    const capacity = capacityByName.has(getQuoteEquipmentNameKey(group.name)) ? Math.max(0, Number(capacityByName.get(getQuoteEquipmentNameKey(group.name))) || 0) : group.availableEquipments.length;
    const prices = group.availableEquipments.map((equipment) => Number(equipment.unitPrice) || 0);
    const first = group.availableEquipments[0] || group.equipments[0];
    return {
      id: Number(first.id),
      name: group.name,
      category: categories[0] || "Outros",
      categories,
      observation: observations.length === 1 ? observations[0] : observations.length > 1 ? "Varia por patrim\xC3\xB4nio" : "",
      totalQuantity: group.equipments.length,
      availableQuantity: Math.min(capacity, group.availableEquipments.length),
      minUnitPrice: prices.length ? Math.min(...prices) : 0,
      maxUnitPrice: prices.length ? Math.max(...prices) : 0,
      equipments: group.availableEquipments
    };
  });
}
__name(groupQuoteEquipmentsByName, "groupQuoteEquipmentsByName");
function normalizeQuoteEquipmentGroupIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter((equipmentId) => Number.isInteger(equipmentId) && equipmentId > 0))].slice(0, 1200);
}
__name(normalizeQuoteEquipmentGroupIds, "normalizeQuoteEquipmentGroupIds");
function normalizeQuoteEquipmentTopic(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ") || "Outros";
}
__name(normalizeQuoteEquipmentTopic, "normalizeQuoteEquipmentTopic");
function getQuoteEquipmentTopicKey(value) {
  return normalizeQuoteEquipmentTopic(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}
__name(getQuoteEquipmentTopicKey, "getQuoteEquipmentTopicKey");
function planQuoteEquipmentTopicRename(rows, sourceTopic, requestedTopic) {
  const normalizedSource = normalizeQuoteEquipmentTopic(sourceTopic);
  const normalizedRequested = normalizeQuoteEquipmentTopic(requestedTopic);
  const sourceKey = getQuoteEquipmentTopicKey(normalizedSource);
  const requestedKey = getQuoteEquipmentTopicKey(normalizedRequested);
  const topics = (Array.isArray(rows) ? rows : []).map((row) => ({
    raw: row?.category ?? null,
    label: normalizeQuoteEquipmentTopic(row?.category),
    key: getQuoteEquipmentTopicKey(row?.category),
    total: Math.max(0, Number(row?.total) || 0)
  }));
  const sourceMatches = topics.filter((topic2) => topic2.key === sourceKey);
  if (!sourceMatches.length) return null;
  const destinationMatches = topics.filter((topic2) => topic2.key === requestedKey);
  let topic = normalizedRequested;
  if (sourceKey !== requestedKey && destinationMatches.length) {
    const exactMatch = destinationMatches.find((entry) => entry.label === normalizedRequested);
    topic = exactMatch?.label || destinationMatches.slice().sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }))[0].label;
  }
  const matchedTopics = sourceKey === requestedKey ? sourceMatches : [...sourceMatches, ...destinationMatches];
  const uniqueTopics = [];
  const seenRawTopics = /* @__PURE__ */ new Set();
  matchedTopics.forEach((entry) => {
    const rawKey = entry.raw === null ? "__NULL__" : `string:${entry.raw}`;
    if (seenRawTopics.has(rawKey)) return;
    seenRawTopics.add(rawKey);
    uniqueTopics.push(entry);
  });
  return {
    sourceTopic: normalizedSource,
    topic,
    rawTopics: uniqueTopics.filter((entry) => entry.raw !== null).map((entry) => entry.raw),
    includesNull: uniqueTopics.some((entry) => entry.raw === null),
    merged: sourceKey !== requestedKey ? destinationMatches.length > 0 : destinationMatches.some((entry) => entry.label === normalizedRequested) && sourceMatches.some((entry) => entry.label !== normalizedRequested),
    total: uniqueTopics.reduce((sum, entry) => sum + entry.total, 0)
  };
}
__name(planQuoteEquipmentTopicRename, "planQuoteEquipmentTopicRename");
function serializeQuoteDatabaseEquipment(row = {}) {
  return {
    ...serializeQuoteEquipment(row),
    hiddenFromQuotes: Number(row.hiddenFromQuotes ?? row.hidden_from_quotes ?? 0) === 1,
    hiddenAt: row.hiddenAt || row.hidden_at || null,
    hiddenByUsername: row.hiddenByUsername || row.hidden_by_username || null
  };
}
__name(serializeQuoteDatabaseEquipment, "serializeQuoteDatabaseEquipment");
async function getQuoteEquipment(db, equipmentId) {
  return db.queryFirst(
    `SELECT id,
                name,
                barcode,
                serial_number AS serialNumber,
                observation,
                current_status AS currentStatus,
                category,
                COALESCE(unit_price, 1) AS unitPrice
         FROM equipments
         WHERE id = ?`,
    [equipmentId]
  );
}
__name(getQuoteEquipment, "getQuoteEquipment");
async function isQuoteEquipmentHidden(db, equipmentId) {
  return !!await db.queryFirst(
    "SELECT equipment_id FROM quote_hidden_equipments WHERE equipment_id = ?",
    [equipmentId]
  );
}
__name(isQuoteEquipmentHidden, "isQuoteEquipmentHidden");
async function handleQuoteEquipmentDatabase(db, url, sendJson) {
  const search = cleanText(url.searchParams.get("search"), 120);
  const wildcard = `%${search}%`;
  const rows = await db.queryAll(
    `SELECT equipments.id,
                equipments.name,
                equipments.barcode,
                equipments.serial_number AS serialNumber,
                equipments.observation,
                equipments.current_status AS currentStatus,
                equipments.category,
                COALESCE(equipments.unit_price, 1) AS unitPrice,
                CASE WHEN quote_hidden_equipments.equipment_id IS NULL THEN 0 ELSE 1 END AS hiddenFromQuotes,
                quote_hidden_equipments.hidden_at AS hiddenAt,
                quote_hidden_equipments.hidden_by_username AS hiddenByUsername
         FROM equipments
         LEFT JOIN quote_hidden_equipments
           ON quote_hidden_equipments.equipment_id = equipments.id
         WHERE equipments.name LIKE ?
            OR equipments.barcode LIKE ?
            OR COALESCE(equipments.observation, '') LIKE ?
            OR COALESCE(equipments.category, '') LIKE ?
         ORDER BY hiddenFromQuotes ASC,
                  lower(COALESCE(equipments.category, 'Outros')) ASC,
                  lower(equipments.name) ASC,
                  equipments.barcode ASC`,
    [wildcard, wildcard, wildcard, wildcard]
  );
  return sendJson({
    equipments: rows.map(serializeQuoteDatabaseEquipment),
    services: await getQuoteServiceSuggestionsFromDatabase(db, search)
  });
}
__name(handleQuoteEquipmentDatabase, "handleQuoteEquipmentDatabase");
async function handleQuoteEquipmentVisibility(db, session, params, sendJson) {
  const { equipmentId, action } = params;
  if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
    return sendJson({ error: "Equipamento inv\xE1lido." }, 400);
  }
  const equipment = await getQuoteEquipment(db, equipmentId);
  if (!equipment) {
    return sendJson({ error: "Equipamento n\xE3o encontrado." }, 404);
  }
  if (action === "ocultar") {
    await db.execute(
      `INSERT INTO quote_hidden_equipments (equipment_id, hidden_by_username)
             VALUES (?, ?)
             ON CONFLICT(equipment_id) DO UPDATE SET
                hidden_by_username = excluded.hidden_by_username,
                hidden_at = CURRENT_TIMESTAMP`,
      [equipmentId, session?.username || null]
    );
    return sendJson({ success: true, equipmentId, hiddenFromQuotes: true });
  }
  await db.execute("DELETE FROM quote_hidden_equipments WHERE equipment_id = ?", [equipmentId]);
  return sendJson({ success: true, equipmentId, hiddenFromQuotes: false });
}
__name(handleQuoteEquipmentVisibility, "handleQuoteEquipmentVisibility");
async function handleQuoteEquipmentGroupName(db, request, helpers, sendJson) {
  const body = await readRequestJson(request, helpers);
  const equipmentIds = normalizeQuoteEquipmentGroupIds(body.equipmentIds);
  const name = cleanText(body.name, 300);
  if (!equipmentIds.length || !name) {
    return sendJson({ error: "Informe os equipamentos e o novo nome." }, 400);
  }
  const existing = await db.queryFirst(
    `SELECT COUNT(*) AS total
         FROM equipments
         WHERE id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))`,
    [JSON.stringify(equipmentIds)]
  );
  if (Number(existing?.total) !== equipmentIds.length) {
    return sendJson({ error: "Um ou mais equipamentos n\xE3o foram encontrados." }, 404);
  }
  await db.execute(
    `UPDATE equipments
         SET name = ?
         WHERE id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))`,
    [name, JSON.stringify(equipmentIds)]
  );
  const price = await db.queryFirst(
    `SELECT MAX(COALESCE(unit_price, 1)) AS unitPrice
         FROM equipments
         WHERE lower(trim(name)) = lower(trim(?))`,
    [name]
  );
  const unitPrice = roundMoney(parseMoneyValue(price?.unitPrice));
  await db.execute(
    `UPDATE equipments
         SET unit_price = ?
         WHERE lower(trim(name)) = lower(trim(?))`,
    [unitPrice, name]
  );
  return sendJson({ success: true, equipmentIds, name, unitPrice, updated: equipmentIds.length });
}
__name(handleQuoteEquipmentGroupName, "handleQuoteEquipmentGroupName");
async function handleQuoteEquipmentTopicName(db, request, helpers, sendJson) {
  const body = await readRequestJson(request, helpers);
  const sourceTopic = cleanText(body.sourceTopic, 160).replace(/\s+/g, " ");
  const requestedTopic = cleanText(body.topic, 160).replace(/\s+/g, " ");
  if (!sourceTopic || !requestedTopic) {
    return sendJson({ error: "Informe o t\xF3pico atual e o novo nome." }, 400);
  }
  const topics = await db.queryAll(
    `SELECT category, COUNT(*) AS total
         FROM equipments
         GROUP BY category`
  );
  const plan = planQuoteEquipmentTopicRename(topics, sourceTopic, requestedTopic);
  if (!plan) {
    return sendJson({ error: "T\xF3pico n\xE3o encontrado." }, 404);
  }
  const predicates = [];
  const params = [plan.topic];
  if (plan.rawTopics.length) {
    predicates.push("category IN (SELECT value FROM json_each(?))");
    params.push(JSON.stringify(plan.rawTopics));
  }
  if (plan.includesNull) predicates.push("category IS NULL");
  const result = await db.execute(
    `UPDATE equipments
         SET category = ?
         WHERE ${predicates.join(" OR ")}`,
    params
  );
  const updated = Number(result?.meta?.changes) || plan.total;
  return sendJson({
    success: true,
    sourceTopic: plan.sourceTopic,
    topic: plan.topic,
    merged: plan.merged,
    updated
  });
}
__name(handleQuoteEquipmentTopicName, "handleQuoteEquipmentTopicName");
async function handleQuoteEquipmentGroupPrice(db, request, helpers, sendJson) {
  const body = await readRequestJson(request, helpers);
  const requestedIds = normalizeQuoteEquipmentGroupIds(body.equipmentIds);
  const unitPrice = roundMoney(parseMoneyValue(body.unitPrice));
  if (!requestedIds.length || !Number.isFinite(unitPrice) || unitPrice < 0) {
    return sendJson({ error: "Informe os equipamentos e um pre\xE7o v\xE1lido." }, 400);
  }
  const names = await db.queryAll(
    `SELECT DISTINCT lower(trim(name)) AS nameKey
         FROM equipments
         WHERE id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))`,
    [JSON.stringify(requestedIds)]
  );
  if (!names.length) {
    return sendJson({ error: "Um ou mais equipamentos n\xE3o foram encontrados." }, 404);
  }
  const nameKeys = names.map((entry) => entry.nameKey);
  const equipments = await db.queryAll(
    `SELECT id FROM equipments
         WHERE lower(trim(name)) IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(nameKeys)]
  );
  const equipmentIds = equipments.map((equipment) => Number(equipment.id));
  await db.execute(
    `UPDATE equipments
         SET unit_price = ?
         WHERE lower(trim(name)) IN (SELECT value FROM json_each(?))`,
    [unitPrice, JSON.stringify(nameKeys)]
  );
  return sendJson({ success: true, equipmentIds, unitPrice, updated: equipmentIds.length });
}
__name(handleQuoteEquipmentGroupPrice, "handleQuoteEquipmentGroupPrice");
async function handleQuoteServicePrice(db, request, params, helpers, sendJson) {
  const serviceId = normalizeQuoteServiceId(params.serviceId);
  const service = QUOTE_SERVICE_BY_ID.get(serviceId);
  const body = await readRequestJson(request, helpers);
  const unitPrice = roundMoney(parseMoneyValue(body.unitPrice));
  if (!service || service.editablePrice !== true) {
    return sendJson({ error: "Servi\xE7o com pre\xE7o edit\xE1vel n\xE3o encontrado." }, 404);
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return sendJson({ error: "Informe um pre\xE7o v\xE1lido." }, 400);
  }
  await db.execute(
    `INSERT INTO quote_service_prices (service_id, unit_price, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(service_id) DO UPDATE SET
            unit_price = excluded.unit_price,
            updated_at = CURRENT_TIMESTAMP`,
    [serviceId, unitPrice]
  );
  return sendJson({ success: true, serviceId, unitPrice });
}
__name(handleQuoteServicePrice, "handleQuoteServicePrice");
async function handleQuoteEquipmentGroupVisibility(db, request, session, params, helpers, sendJson) {
  const body = await readRequestJson(request, helpers);
  const requestedIds = normalizeQuoteEquipmentGroupIds(body.equipmentIds);
  if (!requestedIds.length) {
    return sendJson({ error: "Informe os equipamentos." }, 400);
  }
  const names = await db.queryAll(
    `SELECT DISTINCT lower(trim(name)) AS nameKey
         FROM equipments
         WHERE id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))`,
    [JSON.stringify(requestedIds)]
  );
  if (!names.length) {
    return sendJson({ error: "Um ou mais equipamentos n\xE3o foram encontrados." }, 404);
  }
  const nameKeys = names.map((entry) => entry.nameKey);
  const equipments = await db.queryAll(
    `SELECT id FROM equipments
         WHERE lower(trim(name)) IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(nameKeys)]
  );
  const equipmentIds = equipments.map((equipment) => Number(equipment.id));
  const hidden = params.action === "ocultar";
  const operations = hidden ? equipmentIds.map((equipmentId) => ({
    sql: `INSERT INTO quote_hidden_equipments (equipment_id, hidden_by_username)
                  VALUES (?, ?)
                  ON CONFLICT(equipment_id) DO UPDATE SET
                     hidden_by_username = excluded.hidden_by_username,
                     hidden_at = CURRENT_TIMESTAMP`,
    params: [equipmentId, session?.username || null]
  })) : equipmentIds.map((equipmentId) => ({
    sql: "DELETE FROM quote_hidden_equipments WHERE equipment_id = ?",
    params: [equipmentId]
  }));
  await db.batch(operations);
  return sendJson({ success: true, equipmentIds, hiddenFromQuotes: hidden, updated: equipmentIds.length });
}
__name(handleQuoteEquipmentGroupVisibility, "handleQuoteEquipmentGroupVisibility");
async function handleAvailableQuoteEquipments(db, url, sendJson) {
  const search = cleanText(url.searchParams.get("search"), 120);
  const eventRange = getQuoteOperationalRange({
    assemblyDatetime: cleanText(url.searchParams.get("assemblyDatetime"), 160),
    eventDatetime: cleanText(url.searchParams.get("eventDatetime"), 160),
    disassemblyDatetime: cleanText(url.searchParams.get("disassemblyDatetime"), 160)
  });
  const excludeQuoteId = Number(url.searchParams.get("quoteId") || url.searchParams.get("excludeQuoteId"));
  if (!search) return sendJson({ equipments: [] });
  const services = await getQuoteServiceSuggestionsFromDatabase(db, search);
  if (!eventRange) {
    if (services.length) return sendJson({ equipments: services, eventRange: null });
    return sendJson({ error: "Informe Montagem, Evento e Desmontagem em ordem v\xC3\xA1lida antes de buscar os equipamentos." }, 400);
  }
  const wildcard = `%${search}%`;
  const rows = await db.queryAll(
    `SELECT id,
                name,
                barcode,
                serial_number AS serialNumber,
                observation,
                current_status AS currentStatus,
                COALESCE(category, 'Outros') AS category,
                COALESCE(unit_price, 1) AS unitPrice
         FROM equipments
         WHERE (
                name LIKE ?
                OR barcode LIKE ?
                OR COALESCE(observation, '') LIKE ?
                OR COALESCE(category, 'Outros') LIKE ?
           )
           AND NOT EXISTS (
               SELECT 1
               FROM quote_hidden_equipments
               WHERE quote_hidden_equipments.equipment_id = equipments.id
           )
         ORDER BY CASE
                WHEN lower(COALESCE(category, 'Outros')) = ? THEN 0
                WHEN COALESCE(category, 'Outros') LIKE ? THEN 1
                WHEN name LIKE ? THEN 2
                ELSE 3
            END,
            lower(COALESCE(category, 'Outros')) ASC,
            lower(name) ASC,
            barcode ASC
         LIMIT 1200`,
    [wildcard, wildcard, wildcard, wildcard, search.toLowerCase(), wildcard, wildcard]
  );
  const usableEquipments = rows.filter((equipment) => isQuoteEquipmentUsableStatus(equipment.currentStatus)).map(serializeQuoteEquipment);
  const unavailableIds = await findUnavailableEquipmentIdsDb(
    db,
    usableEquipments.map((equipment) => equipment.id),
    eventRange,
    { excludeQuoteId }
  );
  const capacityGroups = await buildEquipmentGroupCapacityDb(db, eventRange, { excludeQuoteId });
  const capacityByName = /* @__PURE__ */ new Map();
  for (const equipment of usableEquipments) {
    const key = getQuoteEquipmentNameKey(equipment.name);
    if (!capacityByName.has(key)) {
      capacityByName.set(
        key,
        getGroupCapacityForNewReservation(capacityGroups.get(key), eventRange)
      );
    }
  }
  const equipmentGroups = groupQuoteEquipmentsByName(usableEquipments, unavailableIds, capacityByName);
  return sendJson({
    equipments: [...services, ...equipmentGroups],
    eventRange: { start: eventRange.start, end: eventRange.end }
  });
}
__name(handleAvailableQuoteEquipments, "handleAvailableQuoteEquipments");
async function handleQuoteEquipmentSchedule(db, request, params, helpers, sendJson) {
  const { equipmentId } = params;
  if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
    return sendJson({ error: "Equipamento inv\xE1lido." }, 400);
  }
  const body = await readRequestJson(request, helpers);
  const eventRange = getQuoteOperationalRange({
    assemblyDatetime: cleanText(body.assemblyDatetime, 160),
    eventDatetime: cleanText(body.eventDatetime, 160),
    disassemblyDatetime: cleanText(body.disassemblyDatetime, 160)
  });
  if (!eventRange) {
    return sendJson({ error: "Informe Montagem, Evento e Desmontagem em ordem v\xC3\xA1lida antes de acrescentar o equipamento." }, 400);
  }
  const equipment = await getQuoteEquipment(db, equipmentId);
  if (!equipment) return sendJson({ error: "Equipamento n\xE3o encontrado." }, 404);
  if (await isQuoteEquipmentHidden(db, equipmentId)) {
    return sendJson({ error: "Este equipamento est\xE1 oculto no banco de or\xE7amentos." }, 409);
  }
  if (!isQuoteEquipmentUsableStatus(equipment.currentStatus)) {
    return sendJson({ error: "Este equipamento est\xE1 em manuten\xE7\xE3o." }, 409);
  }
  const conflict = await findEquipmentDateConflictDb(db, equipmentId, eventRange, {
    equipment,
    excludeQuoteId: Number(body.quoteId || body.excludeQuoteId)
  });
  if (conflict) return dateConflictResponse(conflict, sendJson);
  return sendJson({ success: true, equipment: serializeQuoteEquipment(equipment) });
}
__name(handleQuoteEquipmentSchedule, "handleQuoteEquipmentSchedule");
async function handleQuoteEquipmentRelease(db, params, sendJson) {
  const { equipmentId } = params;
  if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
    return sendJson({ error: "Equipamento inv\xE1lido." }, 400);
  }
  const equipment = await getQuoteEquipment(db, equipmentId);
  if (!equipment) return sendJson({ error: "Equipamento n\xE3o encontrado." }, 404);
  return sendJson({ success: true, equipment: serializeQuoteEquipment(equipment) });
}
__name(handleQuoteEquipmentRelease, "handleQuoteEquipmentRelease");
async function handleQuoteTechnicians(db, url, sendJson) {
  const search = cleanText(url.searchParams.get("search"), 120);
  const wildcard = `%${search}%`;
  const rows = await db.queryAll(
    `SELECT id,
                full_name AS fullName,
                cpf,
                rg,
                birth_date AS birthDate,
                address,
                email,
                phone,
                area,
                has_vehicle AS hasVehicle,
                pix,
                agency,
                photo,
                cache_value AS cacheValue,
                created_by_username AS createdByUsername,
                created_at AS createdAt,
                updated_at AS updatedAt
         FROM operators
         WHERE full_name LIKE ? OR cpf LIKE ? OR rg LIKE ? OR COALESCE(area, '') LIKE ?
         ORDER BY lower(full_name) ASC
         LIMIT 100`,
    [wildcard, wildcard, wildcard, wildcard]
  );
  return sendJson({ operators: rows.map(serializeOperator) });
}
__name(handleQuoteTechnicians, "handleQuoteTechnicians");
function serializeOperator(row = {}) {
  return {
    id: Number(row.id),
    fullName: row.fullName ?? row.full_name ?? "",
    cpf: row.cpf || "",
    rg: row.rg || "",
    birthDate: row.birthDate ?? row.birth_date ?? "",
    address: row.address || "",
    email: row.email || "",
    phone: row.phone || "",
    area: row.area || "",
    hasVehicle: Number(row.hasVehicle ?? row.has_vehicle ?? 0) === 1,
    pix: row.pix || "",
    agency: row.agency || "",
    photo: row.photo || "",
    cacheValue: roundMoney(row.cacheValue ?? row.cache_value ?? 0),
    createdByUsername: row.createdByUsername ?? row.created_by_username ?? "",
    createdAt: row.createdAt ?? row.created_at ?? "",
    updatedAt: row.updatedAt ?? row.updated_at ?? ""
  };
}
__name(serializeOperator, "serializeOperator");
function toDateKey(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return "";
  }
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}
__name(toDateKey, "toDateKey");
function parseIsoDateKey(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return toDateKey(Number(match[1]), Number(match[2]), Number(match[3]));
}
__name(parseIsoDateKey, "parseIsoDateKey");
function formatDateKeyBR(dateKey) {
  const key = parseIsoDateKey(dateKey);
  if (!key) return "-";
  const [year, month, day] = key.split("-");
  return `${day}/${month}/${year}`;
}
__name(formatDateKeyBR, "formatDateKeyBR");
function createDateRange(startKey, endKey = startKey) {
  const start = parseIsoDateKey(startKey);
  const end = parseIsoDateKey(endKey || startKey);
  if (!start || !end || end < start) return null;
  return {
    start,
    end,
    startLabel: formatDateKeyBR(start),
    endLabel: formatDateKeyBR(end)
  };
}
__name(createDateRange, "createDateRange");
function getQuoteDateRangeFromText(value) {
  const matches = Array.from(String(value || "").matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)).map((match) => toDateKey(Number(match[3]), Number(match[2]), Number(match[1]))).filter(Boolean);
  if (!matches.length) return null;
  return createDateRange(matches[0], matches[1] || matches[0]);
}
__name(getQuoteDateRangeFromText, "getQuoteDateRangeFromText");
function getQuoteOperationalRange(quote = {}) {
  const assemblyRange = getQuoteDateRangeFromText(
    quote.assemblyDatetime ?? quote.assembly_datetime
  );
  const eventRange = getQuoteDateRangeFromText(
    quote.eventDatetime ?? quote.event_datetime
  );
  const disassemblyRange = getQuoteDateRangeFromText(
    quote.disassemblyDatetime ?? quote.disassembly_datetime
  );
  if (!assemblyRange || !eventRange || !disassemblyRange) return null;
  if (assemblyRange.start > eventRange.start || disassemblyRange.end < eventRange.end) return null;
  return createDateRange(assemblyRange.start, disassemblyRange.end);
}
__name(getQuoteOperationalRange, "getQuoteOperationalRange");
function getDateKeysFromRange(range) {
  if (!range) return [];
  const keys = [];
  let cursor = range.start;
  let guard = 0;
  while (cursor && cursor <= range.end && guard < 3700) {
    keys.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
    guard += 1;
  }
  return keys;
}
__name(getDateKeysFromRange, "getDateKeysFromRange");
function getEventDateRange(event) {
  if (!event) return null;
  const eventType = String(event.event_type || event.eventType || "event").trim().toLowerCase();
  if (eventType === "rental") {
    const start = event.withdrawal_date || event.withdrawalDate || event.date;
    const end = event.return_date || event.returnDate || start;
    return createDateRange(start, end);
  }
  return createDateRange(event.date, event.end_date || event.endDate || event.date);
}
__name(getEventDateRange, "getEventDateRange");
function addDaysToDateKey(dateKey, days) {
  const key = parseIsoDateKey(dateKey);
  if (!key) return "";
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}
__name(addDaysToDateKey, "addDaysToDateKey");
function rangesOverlap(currentRange, reservationRange) {
  return !!currentRange && !!reservationRange && currentRange.start <= reservationRange.end && currentRange.end >= reservationRange.start;
}
__name(rangesOverlap, "rangesOverlap");
function getCapacityAllocationKey(quoteId, eventId) {
  const normalizedQuoteId = Number(quoteId);
  if (Number.isInteger(normalizedQuoteId) && normalizedQuoteId > 0) {
    return `quote:${normalizedQuoteId}`;
  }
  return `event:${Number(eventId) || 0}`;
}
__name(getCapacityAllocationKey, "getCapacityAllocationKey");
function ensureCapacityGroup(groups, name) {
  const normalizedName = cleanText(name, 300) || "Equipamento";
  const key = getQuoteEquipmentNameKey(normalizedName);
  if (!groups.has(key)) {
    groups.set(key, {
      key,
      name: normalizedName,
      totalQuantity: 0,
      allocations: /* @__PURE__ */ new Map()
    });
  }
  return groups.get(key);
}
__name(ensureCapacityGroup, "ensureCapacityGroup");
function ensureCapacityAllocation(group, details) {
  const key = getCapacityAllocationKey(details.quoteId, details.eventId);
  if (!group.allocations.has(key)) {
    group.allocations.set(key, {
      key,
      quoteId: Number(details.quoteId) || null,
      eventId: Number(details.eventId) || null,
      eventName: cleanText(details.eventName, 200) || "Reserva existente",
      range: details.range,
      requestedQuantity: 0,
      actualEquipmentIds: /* @__PURE__ */ new Set()
    });
  }
  const allocation = group.allocations.get(key);
  if (!allocation.range && details.range) allocation.range = details.range;
  if (!allocation.eventId && Number(details.eventId)) allocation.eventId = Number(details.eventId);
  return allocation;
}
__name(ensureCapacityAllocation, "ensureCapacityAllocation");
function getCapacityAllocationQuantity(allocation) {
  return Math.max(
    Math.max(0, Number(allocation?.requestedQuantity) || 0),
    allocation?.actualEquipmentIds?.size || 0
  );
}
__name(getCapacityAllocationQuantity, "getCapacityAllocationQuantity");
async function getEquipmentGroupNameVariantsDb(db, equipmentName) {
  const targetKey = getQuoteEquipmentNameKey(equipmentName);
  if (!targetKey) return [];
  const rows = await db.queryAll(
    `SELECT name AS groupName
         FROM equipments
         WHERE name IS NOT NULL AND trim(name) <> ''
         UNION
         SELECT description AS groupName
         FROM quote_items
         WHERE equipment_id IS NOT NULL
           AND description IS NOT NULL
           AND trim(description) <> ''`
  );
  const variants = rows.map((row) => String(row.groupName ?? "")).filter((name) => name.trim() && getQuoteEquipmentNameKey(name) === targetKey);
  variants.push(String(equipmentName ?? ""));
  return [...new Set(variants.filter((name) => name.trim()))];
}
__name(getEquipmentGroupNameVariantsDb, "getEquipmentGroupNameVariantsDb");
async function buildEquipmentGroupCapacityDb(db, currentRange, options = {}) {
  const groups = /* @__PURE__ */ new Map();
  if (!currentRange) return groups;
  const excludeQuoteId = Number(options.excludeQuoteId);
  const targetNames = options.equipmentName ? await getEquipmentGroupNameVariantsDb(db, options.equipmentName) : [];
  const targetNamesJson = targetNames.length ? JSON.stringify(targetNames) : "";
  const targetEquipmentClause = targetNamesJson ? "WHERE name IN (SELECT CAST(value AS TEXT) FROM json_each(?))" : "";
  const targetQuoteClause = targetNamesJson ? `AND COALESCE(equipments.name, quote_items.description) IN (
               SELECT CAST(value AS TEXT) FROM json_each(?)
           )` : "";
  const targetReservedClause = targetNamesJson ? `AND reserved.equipment_id IN (
               SELECT id
               FROM equipments
               WHERE name IN (SELECT CAST(value AS TEXT) FROM json_each(?))
           )` : "";
  const targetMovementClause = targetNamesJson ? `AND equipment_events.equipment_id IN (
               SELECT id
               FROM equipments
               WHERE name IN (SELECT CAST(value AS TEXT) FROM json_each(?))
           )` : "";
  const equipmentParams = targetNamesJson ? [targetNamesJson] : [];
  const quoteParams = targetNamesJson ? [targetNamesJson] : [];
  const reservedParams = targetNamesJson ? [targetNamesJson] : [];
  const movementParams = targetNamesJson ? [targetNamesJson] : [];
  const quoteExcludeClause = Number.isInteger(excludeQuoteId) && excludeQuoteId > 0 ? "AND quotes.id <> ?" : "";
  if (quoteExcludeClause) quoteParams.push(excludeQuoteId);
  const capacityResults = await db.batch([
    {
      sql: `SELECT id, name, current_status AS currentStatus
                  FROM equipments
                  ${targetEquipmentClause}`,
      params: equipmentParams
    },
    {
      sql: `SELECT quotes.id AS quoteId,
                    quotes.event_name AS eventName,
                    quotes.assembly_datetime AS assemblyDatetime,
                    quotes.event_datetime AS eventDatetime,
                    quotes.disassembly_datetime AS disassemblyDatetime,
                    events.id AS eventId,
                    quote_items.quantity,
                    quote_items.description,
                    equipments.name AS equipmentName
             FROM quote_items
             INNER JOIN quotes ON quotes.id = quote_items.quote_id
             LEFT JOIN equipments ON equipments.id = quote_items.equipment_id
             LEFT JOIN events ON events.orcamento_id = quotes.id
              WHERE quote_items.equipment_id IS NOT NULL
                AND COALESCE(quote_items.is_manual, 0) = 0
                ${targetQuoteClause}
                ${quoteExcludeClause}`,
      params: quoteParams
    },
    {
      sql: `SELECT DISTINCT events.id AS eventId,
                    events.orcamento_id AS quoteId,
                    events.name AS eventName,
                    events.date,
                    events.end_date,
                    events.event_type,
                    events.withdrawal_date,
                    events.return_date,
                    reserved.equipment_id AS equipmentId,
                    equipments.name AS equipmentName
             FROM event_reserved_equipments reserved
             INNER JOIN events ON events.id = reserved.event_id
              INNER JOIN equipments ON equipments.id = reserved.equipment_id
              WHERE reserved.quote_item_id IS NULL
                ${targetReservedClause}`,
      params: reservedParams
    },
    {
      sql: `SELECT DISTINCT events.id AS eventId,
                    events.orcamento_id AS quoteId,
                    events.name AS eventName,
                    events.date,
                    events.end_date,
                    events.event_type,
                    events.withdrawal_date,
                    events.return_date,
                    equipment_events.equipment_id AS equipmentId,
                    equipments.name AS equipmentName
             FROM equipment_events
             INNER JOIN events ON events.id = equipment_events.event_id
              INNER JOIN equipments ON equipments.id = equipment_events.equipment_id
              WHERE equipment_events.action_type = 'saida'
                ${targetMovementClause}`,
      params: movementParams
    }
  ]);
  const [equipmentRows, quoteRows, reservedRows, movementRows] = capacityResults.map((result) => result?.results || []);
  for (const equipment of equipmentRows) {
    if (!isQuoteEquipmentUsableStatus(equipment.currentStatus)) continue;
    ensureCapacityGroup(groups, equipment.name).totalQuantity += 1;
  }
  const quoteMetadata = /* @__PURE__ */ new Map();
  for (const row of quoteRows) {
    const range = getQuoteOperationalRange(row);
    if (!range || !rangesOverlap(currentRange, range)) continue;
    const quoteId = Number(row.quoteId);
    quoteMetadata.set(quoteId, {
      quoteId,
      eventId: Number(row.eventId) || null,
      eventName: row.eventName,
      range
    });
    const group = ensureCapacityGroup(groups, row.equipmentName || row.description);
    const allocation = ensureCapacityAllocation(group, {
      quoteId,
      eventId: row.eventId,
      eventName: row.eventName,
      range
    });
    allocation.requestedQuantity += Math.max(1, Number.parseInt(row.quantity, 10) || 1);
  }
  const seenActual = /* @__PURE__ */ new Set();
  const mergeActualRow = /* @__PURE__ */ __name((row) => {
    const eventId = Number(row.eventId);
    const quoteId = Number(row.quoteId);
    const equipmentId = Number(row.equipmentId);
    if (!eventId || !equipmentId) return;
    if (Number.isInteger(excludeQuoteId) && excludeQuoteId > 0 && quoteId === excludeQuoteId) return;
    const actualKey = `${eventId}:${equipmentId}`;
    if (seenActual.has(actualKey)) return;
    seenActual.add(actualKey);
    const quote = quoteMetadata.get(quoteId);
    const range = quote?.range || getEventDateRange(row);
    if (!range || !rangesOverlap(currentRange, range)) return;
    const group = ensureCapacityGroup(groups, row.equipmentName);
    const allocation = ensureCapacityAllocation(group, {
      quoteId: quote?.quoteId || quoteId,
      eventId,
      eventName: quote?.eventName || row.eventName,
      range
    });
    allocation.actualEquipmentIds.add(equipmentId);
  }, "mergeActualRow");
  reservedRows.forEach(mergeActualRow);
  movementRows.forEach(mergeActualRow);
  return groups;
}
__name(buildEquipmentGroupCapacityDb, "buildEquipmentGroupCapacityDb");
function getGroupCapacityForNewReservation(group, currentRange) {
  if (!group || !currentRange) return 0;
  let minimumBalance = Number.POSITIVE_INFINITY;
  for (const date of getDateKeysFromRange(currentRange)) {
    let committed = 0;
    for (const allocation of group.allocations.values()) {
      if (allocation.range?.start <= date && allocation.range?.end >= date) {
        committed += getCapacityAllocationQuantity(allocation);
      }
    }
    minimumBalance = Math.min(minimumBalance, group.totalQuantity - committed);
  }
  return Number.isFinite(minimumBalance) ? Math.max(0, minimumBalance) : 0;
}
__name(getGroupCapacityForNewReservation, "getGroupCapacityForNewReservation");
function getGroupCapacityForEvent(group, event, currentRange) {
  if (!group || !event || !currentRange) return 0;
  const allocationKey = getCapacityAllocationKey(event.orcamento_id ?? event.orcamentoId, event.id);
  const currentAllocation = group.allocations.get(allocationKey);
  const currentActual = currentAllocation?.actualEquipmentIds?.size || 0;
  let available = Number.POSITIVE_INFINITY;
  for (const date of getDateKeysFromRange(currentRange)) {
    let committedByOthers = 0;
    for (const allocation of group.allocations.values()) {
      if (allocation.key === allocationKey) continue;
      if (allocation.range?.start <= date && allocation.range?.end >= date) {
        committedByOthers += getCapacityAllocationQuantity(allocation);
      }
    }
    available = Math.min(available, group.totalQuantity - committedByOthers - currentActual);
  }
  return Number.isFinite(available) ? Math.max(0, available) : 0;
}
__name(getGroupCapacityForEvent, "getGroupCapacityForEvent");
function getCapacityBlockingEventNames(group, currentRange, currentEvent = null) {
  const currentKey = currentEvent ? getCapacityAllocationKey(currentEvent.orcamento_id ?? currentEvent.orcamentoId, currentEvent.id) : "";
  return [...new Set(Array.from(group?.allocations?.values?.() || []).filter((allocation) => allocation.key !== currentKey && rangesOverlap(currentRange, allocation.range)).filter((allocation) => Number(allocation.quoteId) > 0 && getCapacityAllocationQuantity(allocation) > 0).map((allocation) => allocation.eventName).filter(Boolean))];
}
__name(getCapacityBlockingEventNames, "getCapacityBlockingEventNames");
async function findEquipmentGroupCapacityConflictDb(db, equipment, event) {
  const currentRange = getEventDateRange(event);
  if (!equipment || !currentRange) return null;
  const groups = await buildEquipmentGroupCapacityDb(db, currentRange, {
    equipmentName: equipment.name
  });
  const group = groups.get(getQuoteEquipmentNameKey(equipment.name));
  const availableQuantity = getGroupCapacityForEvent(group, event, currentRange);
  if (availableQuantity > 0) return null;
  const blockingEventNames = getCapacityBlockingEventNames(group, currentRange, event);
  return {
    type: "group_capacity",
    equipmentId: Number(equipment.id) || null,
    equipmentName: equipment.name || "Equipamento",
    totalQuantity: Number(group?.totalQuantity) || 0,
    availableQuantity: 0,
    blockingEventName: blockingEventNames[0] || "Or\xC3\xA7amento no mesmo per\xC3\xADodo",
    blockingEventNames,
    currentStart: currentRange.start,
    currentEnd: currentRange.end,
    currentStartLabel: currentRange.startLabel,
    currentEndLabel: currentRange.endLabel
  };
}
__name(findEquipmentGroupCapacityConflictDb, "findEquipmentGroupCapacityConflictDb");
async function getEventEquipmentRequirementsDb(db, eventId) {
  const event = await db.queryFirst(
    `SELECT id, orcamento_id AS quoteId
         FROM events
         WHERE id = ?`,
    [Number(eventId)]
  );
  if (!event || !Number(event.quoteId)) return [];
  const [requestedRows, movementRows] = await Promise.all([
    db.queryAll(
      `SELECT quote_items.quantity,
                    quote_items.description,
                    equipments.name AS equipmentName
             FROM quote_items
             LEFT JOIN equipments ON equipments.id = quote_items.equipment_id
             WHERE quote_items.quote_id = ?
               AND quote_items.equipment_id IS NOT NULL
               AND COALESCE(quote_items.is_manual, 0) = 0
             ORDER BY quote_items.sort_order ASC, quote_items.id ASC`,
      [Number(event.quoteId)]
    ),
    db.queryAll(
      `SELECT DISTINCT equipment_events.equipment_id AS equipmentId,
                    equipments.name AS equipmentName
             FROM equipment_events
             INNER JOIN equipments ON equipments.id = equipment_events.equipment_id
             WHERE equipment_events.event_id = ?
               AND equipment_events.action_type = 'saida'`,
      [Number(eventId)]
    )
  ]);
  const requirements = /* @__PURE__ */ new Map();
  for (const row of requestedRows) {
    const name = cleanText(row.equipmentName || row.description, 300) || "Equipamento";
    const key = getQuoteEquipmentNameKey(name);
    if (!requirements.has(key)) {
      requirements.set(key, { name, requestedQuantity: 0, outgoingEquipmentIds: /* @__PURE__ */ new Set() });
    }
    requirements.get(key).requestedQuantity += Math.max(1, Number.parseInt(row.quantity, 10) || 1);
  }
  for (const row of movementRows) {
    const key = getQuoteEquipmentNameKey(row.equipmentName);
    const requirement = requirements.get(key);
    if (requirement) requirement.outgoingEquipmentIds.add(Number(row.equipmentId));
  }
  return Array.from(requirements.values()).map((requirement) => {
    const outgoingQuantity = requirement.outgoingEquipmentIds.size;
    const pendingQuantity = Math.max(0, requirement.requestedQuantity - outgoingQuantity);
    return {
      name: requirement.name,
      requestedQuantity: requirement.requestedQuantity,
      outgoingQuantity,
      pendingQuantity,
      completed: pendingQuantity === 0
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
__name(getEventEquipmentRequirementsDb, "getEventEquipmentRequirementsDb");
function createDateConflict({ equipment, currentRange, reservation }) {
  return {
    type: "date_conflict",
    equipmentId: Number(equipment?.id || reservation?.equipmentId || 0) || null,
    equipmentName: equipment?.name || reservation?.equipmentName || "Patrim\xF4nio",
    blockingEventName: reservation?.eventName || "Reserva existente",
    blockingSource: reservation?.source || "reservation",
    currentStart: currentRange?.start || "",
    currentEnd: currentRange?.end || "",
    currentStartLabel: currentRange?.startLabel || "-",
    currentEndLabel: currentRange?.endLabel || "-",
    reservationStart: reservation?.range?.start || "",
    reservationEnd: reservation?.range?.end || "",
    reservationStartLabel: reservation?.range?.startLabel || "-",
    reservationEndLabel: reservation?.range?.endLabel || "-"
  };
}
__name(createDateConflict, "createDateConflict");
function dateConflictResponse(conflict, sendJson) {
  if (conflict?.type === "group_capacity") {
    return sendJson({
      code: "QUOTE_CAPACITY_PROTECTED",
      error: `Quantidade insuficiente de "${conflict.equipmentName || "equipamento"}" para este per\xC3\xADodo. Dispon\xC3\xADvel: ${Number(conflict.availableQuantity) || 0}.`,
      conflict
    }, 409);
  }
  return sendJson({
    code: "DATE_CONFLICT",
    error: "Patrim\xF4nio indispon\xEDvel por conflito de datas.",
    conflict
  }, 409);
}
__name(dateConflictResponse, "dateConflictResponse");
async function findEquipmentDateConflictDb(db, equipmentId, currentRange, options = {}) {
  const normalizedEquipmentId = Number(equipmentId);
  if (!Number.isInteger(normalizedEquipmentId) || normalizedEquipmentId <= 0 || !currentRange) {
    return null;
  }
  const equipment = options.equipment || await getQuoteEquipment(db, normalizedEquipmentId);
  if (!equipment) return null;
  const excludeEventId = Number(options.excludeEventId);
  const reservedEventParams = [normalizedEquipmentId];
  let reservedEventExcludeClause = "";
  if (Number.isInteger(excludeEventId) && excludeEventId > 0) {
    reservedEventExcludeClause = "AND events.id <> ?";
    reservedEventParams.push(excludeEventId);
  }
  const movementEventParams = [normalizedEquipmentId];
  let movementEventExcludeClause = "";
  if (Number.isInteger(excludeEventId) && excludeEventId > 0) {
    movementEventExcludeClause = "AND events.id <> ?";
    movementEventParams.push(excludeEventId);
  }
  const conflictResults = await db.batch([
    {
      sql: `SELECT DISTINCT events.id,
                events.name AS eventName,
                events.date,
                events.end_date,
                events.event_type,
                events.withdrawal_date,
                events.return_date
         FROM event_reserved_equipments reserved
         INNER JOIN events ON events.id = reserved.event_id
         WHERE reserved.equipment_id = ?
           AND (events.orcamento_id IS NULL OR reserved.quote_item_id IS NULL)
           ${reservedEventExcludeClause}
         ORDER BY events.date DESC, events.id DESC`,
      params: reservedEventParams
    },
    {
      sql: `SELECT DISTINCT events.id,
                events.name AS eventName,
                events.date,
                events.end_date,
                events.event_type,
                events.withdrawal_date,
                events.return_date
         FROM equipment_events
         INNER JOIN events ON events.id = equipment_events.event_id
         WHERE equipment_events.equipment_id = ?
           AND equipment_events.action_type = 'saida'
           ${movementEventExcludeClause}
         ORDER BY events.date DESC, events.id DESC`,
      params: movementEventParams
    }
  ]);
  const reservedEvents = conflictResults[0]?.results || [];
  const movementEvents = conflictResults[1]?.results || [];
  for (const reservation of reservedEvents) {
    const reservationRange = getEventDateRange(reservation);
    if (reservationRange && rangesOverlap(currentRange, reservationRange)) {
      return createDateConflict({
        equipment,
        currentRange,
        reservation: {
          source: "event_reservation",
          eventName: reservation.eventName,
          range: reservationRange
        }
      });
    }
  }
  for (const reservation of movementEvents) {
    const reservationRange = getEventDateRange(reservation);
    if (reservationRange && rangesOverlap(currentRange, reservationRange)) {
      return createDateConflict({
        equipment,
        currentRange,
        reservation: {
          source: "event",
          eventName: reservation.eventName,
          range: reservationRange
        }
      });
    }
  }
  return null;
}
__name(findEquipmentDateConflictDb, "findEquipmentDateConflictDb");
async function findUnavailableEquipmentIdsDb(db, equipmentIds, currentRange, options = {}) {
  const normalizedIds = [...new Set((equipmentIds || []).map(Number).filter((equipmentId) => Number.isInteger(equipmentId) && equipmentId > 0))];
  const unavailableIds = /* @__PURE__ */ new Set();
  if (!normalizedIds.length || !currentRange) return unavailableIds;
  const selectedEquipmentJson = JSON.stringify(normalizedIds);
  const excludeEventId = Number(options.excludeEventId);
  const eventExcludeClause = Number.isInteger(excludeEventId) && excludeEventId > 0 ? "AND events.id <> ?" : "";
  const reservedParams = [selectedEquipmentJson];
  const movementParams = [selectedEquipmentJson];
  if (eventExcludeClause) {
    reservedParams.push(excludeEventId);
    movementParams.push(excludeEventId);
  }
  const [reservedEvents, movementEvents] = await Promise.all([
    db.queryAll(
      `SELECT DISTINCT reserved.equipment_id AS equipmentId,
                    events.date,
                    events.end_date,
                    events.event_type,
                    events.withdrawal_date,
                    events.return_date
             FROM event_reserved_equipments reserved
             INNER JOIN events ON events.id = reserved.event_id
             WHERE reserved.equipment_id IN (
                 SELECT CAST(value AS INTEGER) FROM json_each(?)
             )
               AND (events.orcamento_id IS NULL OR reserved.quote_item_id IS NULL)
               ${eventExcludeClause}`,
      reservedParams
    ),
    db.queryAll(
      `SELECT DISTINCT equipment_events.equipment_id AS equipmentId,
                    events.date,
                    events.end_date,
                    events.event_type,
                    events.withdrawal_date,
                    events.return_date
             FROM equipment_events
             INNER JOIN events ON events.id = equipment_events.event_id
             WHERE equipment_events.equipment_id IN (
                 SELECT CAST(value AS INTEGER) FROM json_each(?)
             )
               AND equipment_events.action_type = 'saida'
               ${eventExcludeClause}`,
      movementParams
    )
  ]);
  for (const reservation of [...reservedEvents, ...movementEvents]) {
    const range = getEventDateRange(reservation);
    if (range && rangesOverlap(currentRange, range)) unavailableIds.add(Number(reservation.equipmentId));
  }
  return unavailableIds;
}
__name(findUnavailableEquipmentIdsDb, "findUnavailableEquipmentIdsDb");
async function findQuoteItemsDateConflict(db, items, currentRange, options = {}) {
  const requestedByName = /* @__PURE__ */ new Map();
  for (const item of items || []) {
    const equipmentId = Number(item?.equipmentId);
    if (!Number.isInteger(equipmentId) || equipmentId <= 0) continue;
    const name = cleanText(item.description, 300) || "Equipamento";
    const key = getQuoteEquipmentNameKey(name);
    if (!requestedByName.has(key)) requestedByName.set(key, { name, quantity: 0 });
    requestedByName.get(key).quantity += Math.max(1, Number.parseInt(item.quantity, 10) || 1);
  }
  if (!requestedByName.size || !currentRange) return null;
  const groups = await buildEquipmentGroupCapacityDb(db, currentRange, {
    excludeQuoteId: options.excludeQuoteId
  });
  for (const [key, requested] of requestedByName) {
    const group = groups.get(key);
    const availableQuantity = getGroupCapacityForNewReservation(group, currentRange);
    if (requested.quantity <= availableQuantity) continue;
    const blockingEventNames = getCapacityBlockingEventNames(group, currentRange);
    return {
      type: "group_capacity",
      equipmentName: requested.name,
      totalQuantity: Number(group?.totalQuantity) || 0,
      requestedQuantity: requested.quantity,
      availableQuantity,
      blockingEventName: blockingEventNames[0] || "Reserva no mesmo per\xC3\xADodo",
      blockingEventNames,
      currentStart: currentRange.start,
      currentEnd: currentRange.end,
      currentStartLabel: currentRange.startLabel,
      currentEndLabel: currentRange.endLabel
    };
  }
  return null;
}
__name(findQuoteItemsDateConflict, "findQuoteItemsDateConflict");
async function handleQuoteDateConflicts(db, url, sendJson) {
  const date = cleanText(url.searchParams.get("date"), 20);
  const excludeId = Number(url.searchParams.get("excludeId"));
  if (!parseIsoDateKey(date)) {
    return sendJson({ error: "Data inv\xE1lida" }, 400);
  }
  const params = [];
  const excludeClause = Number.isInteger(excludeId) && excludeId > 0 ? "WHERE id <> ?" : "";
  if (excludeClause) params.push(excludeId);
  const quotes = await db.queryAll(
    `SELECT id,
                client_name AS clientName,
                event_name AS eventName,
                event_location AS eventLocation,
                event_datetime AS eventDatetime,
                assembly_datetime AS assemblyDatetime,
                disassembly_datetime AS disassemblyDatetime,
                COALESCE(status, 'pending') AS status
         FROM quotes
         ${excludeClause}
         ORDER BY created_at DESC, id DESC`,
    params
  );
  return sendJson({
    conflicts: quotes.filter((quote) => getDateKeysFromRange(getQuoteOperationalRange(quote)).includes(date))
  });
}
__name(handleQuoteDateConflicts, "handleQuoteDateConflicts");
function serializeQuoteTechnician(row = {}) {
  const dailyUnits = Math.max(1, Number.parseInt(row.dailyUnits ?? row.daily_units, 10) || 1);
  const cacheValue = roundMoney(parseMoneyValue(row.cacheValue ?? row.cache_value));
  const rawOperatorId = row.operatorId ?? row.operator_id;
  return {
    id: row.id ? Number(row.id) : null,
    operatorId: rawOperatorId ? Number(rawOperatorId) : null,
    operatorName: row.operatorName ?? row.operator_name ?? "",
    dailyUnits,
    cacheValue,
    paymentTotal: roundMoney(dailyUnits * cacheValue),
    paidAt: row.paidAt ?? row.paid_at ?? null,
    paidByUsername: row.paidByUsername ?? row.paid_by_username ?? null,
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0) || 0
  };
}
__name(serializeQuoteTechnician, "serializeQuoteTechnician");
function getQuotePaymentDateKey(quote) {
  const range = getQuoteDateRangeFromText(quote?.disassemblyDatetime || quote?.disassembly_datetime);
  return range ? addDaysToDateKey(range.end, 30) : "";
}
__name(getQuotePaymentDateKey, "getQuotePaymentDateKey");
function serializeQuotePaymentEntry(row = {}) {
  const technician = serializeQuoteTechnician(row);
  const paymentDate = getQuotePaymentDateKey(row);
  return {
    id: technician.id,
    quoteId: Number(row.quoteId ?? row.quote_id),
    eventName: row.eventName ?? row.event_name ?? "",
    clientName: row.clientName ?? row.client_name ?? "",
    eventLocation: row.eventLocation ?? row.event_location ?? "",
    eventDatetime: row.eventDatetime ?? row.event_datetime ?? "",
    disassemblyDatetime: row.disassemblyDatetime ?? row.disassembly_datetime ?? "",
    paymentDate,
    paymentDateLabel: formatDateKeyBR(paymentDate),
    operatorId: technician.operatorId,
    operatorName: technician.operatorName,
    dailyUnits: technician.dailyUnits,
    cacheValue: technician.cacheValue,
    paymentTotal: technician.paymentTotal,
    paidAt: technician.paidAt,
    paidByUsername: technician.paidByUsername
  };
}
__name(serializeQuotePaymentEntry, "serializeQuotePaymentEntry");
async function getQuotePaymentEntries(db) {
  const rows = await db.queryAll(
    `SELECT quote_technicians.id,
                quote_technicians.operator_id AS operatorId,
                quote_technicians.operator_name AS operatorName,
                quote_technicians.daily_units AS dailyUnits,
                quote_technicians.cache_value AS cacheValue,
                quote_technicians.paid_at AS paidAt,
                quote_technicians.paid_by_username AS paidByUsername,
                quote_technicians.sort_order AS sortOrder,
                quotes.id AS quoteId,
                quotes.event_name AS eventName,
                quotes.client_name AS clientName,
                quotes.event_location AS eventLocation,
                quotes.event_datetime AS eventDatetime,
                quotes.disassembly_datetime AS disassemblyDatetime
         FROM quote_technicians
         INNER JOIN quotes ON quotes.id = quote_technicians.quote_id
         WHERE quotes.status = 'approved'
         ORDER BY quotes.disassembly_datetime ASC, quotes.event_name ASC, quote_technicians.sort_order ASC`
  );
  return rows.map(serializeQuotePaymentEntry).filter((entry) => entry.paymentDate).sort((first, second) => first.paymentDate.localeCompare(second.paymentDate) || String(first.eventName).localeCompare(String(second.eventName), "pt-BR") || String(first.operatorName).localeCompare(String(second.operatorName), "pt-BR"));
}
__name(getQuotePaymentEntries, "getQuotePaymentEntries");
async function handleQuotePayments(db, sendJson) {
  return sendJson({ payments: await getQuotePaymentEntries(db) });
}
__name(handleQuotePayments, "handleQuotePayments");
async function handleQuotePaymentPaid(db, session, params, sendJson) {
  const { paymentId } = params;
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    return sendJson({ error: "Pagamento inv\xE1lido" }, 400);
  }
  const payment = await db.queryFirst(
    `SELECT quote_technicians.id,
                quote_technicians.quote_id AS quoteId,
                quote_technicians.paid_at AS paidAt,
                COALESCE(quotes.status, 'pending') AS quoteStatus
         FROM quote_technicians
         INNER JOIN quotes ON quotes.id = quote_technicians.quote_id
         WHERE quote_technicians.id = ?`,
    [paymentId]
  );
  if (!payment) return sendJson({ error: "Pagamento n\xE3o encontrado" }, 404);
  if (payment.quoteStatus !== "approved") {
    return sendJson({ error: "Somente pagamentos de or\xE7amentos aprovados podem ser marcados como pagos." }, 409);
  }
  const result = await db.execute(
    `UPDATE quote_technicians
         SET paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
             paid_by_username = COALESCE(paid_by_username, ?),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND quote_id = ?
           AND EXISTS (
               SELECT 1 FROM quotes
               WHERE quotes.id = quote_technicians.quote_id
                 AND quotes.status = 'approved'
           )`,
    [session?.username || null, paymentId, Number(payment.quoteId)]
  );
  if (getChangedRowCount(result) !== 1) {
    return sendJson({
      error: "O or\xE7amento ou o pagamento mudou durante a opera\xE7\xE3o. Atualize a tela e tente novamente."
    }, 409);
  }
  return sendJson({ success: true, id: paymentId });
}
__name(handleQuotePaymentPaid, "handleQuotePaymentPaid");
async function handleQuotePaymentCorrect(db, params, sendJson) {
  const { paymentId } = params;
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    return sendJson({ error: "Pagamento inv\xE1lido" }, 400);
  }
  const payment = await db.queryFirst(
    `SELECT quote_technicians.id,
                quote_technicians.quote_id AS quoteId,
                COALESCE(quotes.status, 'pending') AS quoteStatus
         FROM quote_technicians
         INNER JOIN quotes ON quotes.id = quote_technicians.quote_id
         WHERE quote_technicians.id = ?`,
    [paymentId]
  );
  if (!payment) return sendJson({ error: "Pagamento n\xE3o encontrado" }, 404);
  if (payment.quoteStatus !== "approved") {
    return sendJson({ error: "Somente pagamentos de or\xE7amentos aprovados podem ser corrigidos." }, 409);
  }
  const result = await db.execute(
    `UPDATE quote_technicians
         SET paid_at = NULL,
             paid_by_username = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND quote_id = ?
           AND EXISTS (
               SELECT 1 FROM quotes
               WHERE quotes.id = quote_technicians.quote_id
                 AND quotes.status = 'approved'
           )`,
    [paymentId, Number(payment.quoteId)]
  );
  if (getChangedRowCount(result) !== 1) {
    return sendJson({
      error: "O or\xE7amento ou o pagamento mudou durante a opera\xE7\xE3o. Atualize a tela e tente novamente."
    }, 409);
  }
  return sendJson({ success: true, id: paymentId });
}
__name(handleQuotePaymentCorrect, "handleQuotePaymentCorrect");
function normalizeEquipmentQuoteItem(item, index, usedEquipmentIds, equipmentById, servicePriceOverrides) {
  const serviceItem = normalizeQuoteServiceItem(item, index, servicePriceOverrides);
  if (serviceItem) return serviceItem;
  const equipmentId = Number(item?.equipmentId);
  if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
    if (!parseBooleanFlag(item?.isManual)) {
      throw httpError("Item de or\xE7amento sem equipamento cadastrado inv\xE1lido.", 400);
    }
    const description = cleanText(item?.description, 300);
    const quantity = Number.parseInt(item?.quantity, 10);
    const dailyUnits2 = Number.parseInt(item?.dailyUnits, 10);
    const internalUnitPrice2 = roundMoney(parseMoneyValue(item?.internalUnitPrice));
    if (!description) throw httpError("Digite o nome do equipamento avulso.", 400);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw httpError("Informe uma quantidade v\xE1lida para o equipamento avulso.", 400);
    }
    if (!Number.isInteger(dailyUnits2) || dailyUnits2 <= 0) {
      throw httpError("Informe uma quantidade v\xE1lida de di\xE1rias para o equipamento avulso.", 400);
    }
    if (!Number.isFinite(internalUnitPrice2) || internalUnitPrice2 < 0) {
      throw httpError("Informe um pre\xE7o v\xE1lido para o equipamento avulso.", 400);
    }
    return {
      equipmentId: null,
      isManual: true,
      category: "outros",
      description,
      quantity,
      dailyUnits: dailyUnits2,
      internalUnitPrice: internalUnitPrice2,
      internalTotal: roundMoney(quantity * dailyUnits2 * internalUnitPrice2),
      sortOrder: index + 1
    };
  }
  if (usedEquipmentIds.has(equipmentId)) {
    throw httpError("O mesmo equipamento foi acrescentado mais de uma vez ao or\xE7amento.", 400);
  }
  const equipment = equipmentById.get(equipmentId);
  if (!equipment) throw httpError("Equipamento n\xE3o encontrado.", 404);
  if (!isQuoteEquipmentUsableStatus(equipment.currentStatus)) {
    throw httpError(`O equipamento "${equipment.name}" est\xE1 em manuten\xE7\xE3o.`, 409);
  }
  usedEquipmentIds.add(equipmentId);
  const category = QUOTE_CATEGORIES.has(item?.category) ? item.category : "transmissao";
  const dailyUnits = Math.max(1, Number.parseInt(item?.dailyUnits, 10) || 1);
  const internalUnitPrice = roundMoney(parseMoneyValue(equipment.unitPrice));
  return {
    equipmentId,
    isManual: false,
    category,
    description: equipment.name,
    quantity: 1,
    dailyUnits,
    internalUnitPrice,
    internalTotal: roundMoney(dailyUnits * internalUnitPrice),
    sortOrder: index + 1
  };
}
__name(normalizeEquipmentQuoteItem, "normalizeEquipmentQuoteItem");
async function getQuoteItemsFromBody(db, items) {
  const inputItems = Array.isArray(items) ? items : [];
  const servicePriceOverrides = await getQuoteServicePriceOverrides(db);
  const equipmentIds = [...new Set(inputItems.map((item) => Number(item?.equipmentId)).filter((equipmentId) => Number.isInteger(equipmentId) && equipmentId > 0))];
  const equipmentRows = equipmentIds.length ? await db.queryAll(
    `SELECT equipments.id,
                    equipments.name,
                    equipments.barcode,
                    equipments.serial_number AS serialNumber,
                    equipments.observation,
                    equipments.current_status AS currentStatus,
                    equipments.category,
                    COALESCE(equipments.unit_price, 1) AS unitPrice
             FROM equipments
             INNER JOIN json_each(?) selected
               ON CAST(selected.value AS INTEGER) = equipments.id`,
    [JSON.stringify(equipmentIds)]
  ) : [];
  const equipmentById = new Map(equipmentRows.map((equipment) => [Number(equipment.id), equipment]));
  const usedEquipmentIds = /* @__PURE__ */ new Set();
  const normalizedItems = [];
  for (const [index, item] of inputItems.entries()) {
    const normalized = normalizeEquipmentQuoteItem(
      item,
      index,
      usedEquipmentIds,
      equipmentById,
      servicePriceOverrides
    );
    if (normalized) normalizedItems.push(normalized);
  }
  return normalizedItems;
}
__name(getQuoteItemsFromBody, "getQuoteItemsFromBody");
async function normalizeQuoteTechniciansFromBody(db, technicians) {
  const inputTechnicians = Array.isArray(technicians) ? technicians : [];
  const requested = inputTechnicians.map((technician, index) => ({
    index,
    technician,
    operatorId: Number(
      technician?.operatorId ?? technician?.operator_id ?? technician?.technicianId ?? technician?.technician_id
    )
  }));
  const operatorIds = requested.map(({ operatorId }) => operatorId).filter((operatorId) => Number.isInteger(operatorId) && operatorId > 0);
  const operatorRows = operatorIds.length ? await db.queryAll(
    `SELECT operators.id,
                    operators.full_name AS fullName,
                    operators.cache_value AS cacheValue
             FROM operators
             INNER JOIN json_each(?) selected
               ON CAST(selected.value AS INTEGER) = operators.id`,
    [JSON.stringify([...new Set(operatorIds)])]
  ) : [];
  const operatorById = new Map(operatorRows.map((operator) => [Number(operator.id), operator]));
  const normalizedTechnicians = [];
  const usedOperatorIds = /* @__PURE__ */ new Set();
  for (const { index, technician, operatorId } of requested) {
    if (!Number.isInteger(operatorId) || operatorId <= 0) {
      throw httpError("Selecione um t\xE9cnico cadastrado para o or\xE7amento.", 400);
    }
    if (usedOperatorIds.has(operatorId)) {
      throw httpError("O mesmo t\xE9cnico foi acrescentado mais de uma vez ao or\xE7amento.", 400);
    }
    const dailyUnits = Number.parseInt(technician?.dailyUnits ?? technician?.daily_units, 10);
    if (!Number.isInteger(dailyUnits) || dailyUnits <= 0) {
      throw httpError("Informe uma quantidade v\xE1lida de di\xE1rias para cada t\xE9cnico.", 400);
    }
    const operator = operatorById.get(operatorId);
    if (!operator) throw httpError("T\xE9cnico n\xE3o encontrado.", 404);
    usedOperatorIds.add(operatorId);
    const cacheValue = roundMoney(parseMoneyValue(operator.cacheValue));
    normalizedTechnicians.push({
      operatorId,
      operatorName: cleanText(operator.fullName, 160),
      dailyUnits,
      cacheValue,
      paymentTotal: roundMoney(dailyUnits * cacheValue),
      sortOrder: index + 1
    });
  }
  return normalizedTechnicians;
}
__name(normalizeQuoteTechniciansFromBody, "normalizeQuoteTechniciansFromBody");
async function getQuoteTechnicians(db, quoteId) {
  const rows = await db.queryAll(
    `SELECT id,
                operator_id AS operatorId,
                operator_name AS operatorName,
                daily_units AS dailyUnits,
                cache_value AS cacheValue,
                paid_at AS paidAt,
                paid_by_username AS paidByUsername,
                sort_order AS sortOrder
         FROM quote_technicians
         WHERE quote_id = ?
         ORDER BY sort_order ASC, id ASC`,
    [quoteId]
  );
  return rows.map(serializeQuoteTechnician);
}
__name(getQuoteTechnicians, "getQuoteTechnicians");
async function getQuoteWithItems(db, quoteId) {
  const quote = await db.queryFirst(
    `SELECT id,
                proposal_city AS proposalCity,
                proposal_date AS proposalDate,
                client_name AS clientName,
                event_name AS eventName,
                event_location AS eventLocation,
                event_datetime AS eventDatetime,
                assembly_datetime AS assemblyDatetime,
                disassembly_datetime AS disassemblyDatetime,
                payment_method AS paymentMethod,
                payment_deadline AS paymentDeadline,
                COALESCE(logistics_price, 0) AS logisticsPrice,
                COALESCE(technicians_price, 0) AS techniciansPrice,
                subtotal,
                final_total AS finalTotal,
                COALESCE(show_item_prices, 0) AS showItemPrices,
                notes,
                COALESCE(status, 'pending') AS status,
                approved_at AS approvedAt,
                created_by_username AS createdByUsername,
                created_at AS createdAt,
                updated_at AS updatedAt
         FROM quotes
         WHERE id = ?`,
    [quoteId]
  );
  if (!quote) return null;
  quote.showItemPrices = Number(quote.showItemPrices) === 1;
  quote.items = await db.queryAll(
    `SELECT id,
                equipment_id AS equipmentId,
                COALESCE(is_manual, 0) AS isManual,
                COALESCE(is_service, 0) AS isService,
                service_id AS serviceId,
                service_width AS serviceWidth,
                service_height AS serviceHeight,
                category,
                description,
                quantity,
                daily_units AS dailyUnits,
                internal_unit_price AS internalUnitPrice,
                internal_total AS internalTotal,
                sort_order AS sortOrder
         FROM quote_items
         WHERE quote_id = ?
         ORDER BY sort_order ASC, id ASC`,
    [quoteId]
  );
  quote.items = quote.items.map((item) => ({
    ...item,
    isManual: Number(item.isManual) === 1,
    isService: Number(item.isService) === 1
  }));
  quote.technicians = await getQuoteTechnicians(db, quoteId);
  return quote;
}
__name(getQuoteWithItems, "getQuoteWithItems");
function getTodayDateInput() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(/* @__PURE__ */ new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
__name(getTodayDateInput, "getTodayDateInput");
async function normalizeQuotePayload(db, body) {
  const items = await getQuoteItemsFromBody(db, body?.items);
  const technicians = await normalizeQuoteTechniciansFromBody(db, body?.technicians);
  const itemsSubtotal = roundMoney(items.reduce((sum, item) => sum + item.internalTotal, 0));
  const techniciansSubtotal = roundMoney(
    technicians.reduce((sum, technician) => sum + technician.paymentTotal, 0)
  );
  const logisticsPrice = roundMoney(Math.max(0, parseMoneyValue(body?.logisticsPrice)));
  const techniciansPrice = roundMoney(Math.max(0, parseMoneyValue(body?.techniciansPrice)));
  const subtotal = roundMoney(itemsSubtotal + techniciansSubtotal + logisticsPrice + techniciansPrice);
  const finalTotalInput = body?.finalTotal === void 0 || body?.finalTotal === "" ? subtotal : body.finalTotal;
  const finalTotal = roundMoney(parseMoneyValue(finalTotalInput));
  const quote = {
    proposalCity: cleanText(body?.proposalCity, 80) || "Belo Horizonte",
    proposalDate: cleanText(body?.proposalDate, 20) || getTodayDateInput(),
    clientName: cleanText(body?.clientName, 160),
    eventName: cleanText(body?.eventName, 200),
    eventLocation: cleanText(body?.eventLocation, 220),
    eventDatetime: cleanText(body?.eventDatetime, 160),
    assemblyDatetime: cleanText(body?.assemblyDatetime, 160),
    disassemblyDatetime: cleanText(body?.disassemblyDatetime, 160),
    paymentMethod: cleanText(body?.paymentMethod, 160),
    paymentDeadline: cleanText(body?.paymentDeadline, 120),
    logisticsPrice,
    techniciansPrice,
    showItemPrices: parseBooleanFlag(body?.showItemPrices),
    notes: cleanText(body?.notes, 800),
    subtotal,
    finalTotal
  };
  if (!quote.clientName || !quote.eventName || !quote.eventLocation || !quote.eventDatetime || !quote.assemblyDatetime || !quote.disassemblyDatetime) {
    throw httpError("Preencha as informa\xE7\xF5es gerais do or\xE7amento.", 400);
  }
  if (!quote.paymentMethod || !quote.paymentDeadline) {
    throw httpError("Preencha as condi\xE7\xF5es de pagamento.", 400);
  }
  if (items.length === 0) {
    throw httpError("Adicione pelo menos um item ao or\xE7amento.", 400);
  }
  const eventRange = getQuoteOperationalRange(quote);
  if (!eventRange) {
    throw httpError("Informe Montagem, Evento e Desmontagem em ordem v\xE1lida.", 400);
  }
  return { quote, items, technicians, eventRange };
}
__name(normalizeQuotePayload, "normalizeQuotePayload");
function quoteItemsInsertOperation(quoteId, items) {
  if (!items.length) return null;
  const useLastInsertedQuote = quoteId === null;
  const serializedItems = JSON.stringify(items.map((item) => ({
    equipmentId: item.equipmentId || null,
    isManual: item.isManual ? 1 : 0,
    isService: item.isService ? 1 : 0,
    serviceId: item.serviceId || null,
    serviceWidth: item.serviceWidth || null,
    serviceHeight: item.serviceHeight || null,
    category: item.category,
    description: item.description,
    quantity: item.quantity,
    dailyUnits: item.dailyUnits,
    internalUnitPrice: item.internalUnitPrice,
    internalTotal: item.internalTotal,
    sortOrder: item.sortOrder
  })));
  return {
    sql: `${useLastInsertedQuote ? "WITH new_quote(quote_id) AS MATERIALIZED (SELECT last_insert_rowid())" : ""}
              INSERT INTO quote_items (
                quote_id,
                equipment_id,
                is_manual,
                is_service,
                service_id,
                service_width,
                service_height,
                category,
                description,
                quantity,
                daily_units,
                internal_unit_price,
                internal_total,
                sort_order
              )
              SELECT ${useLastInsertedQuote ? "new_quote.quote_id" : "?"},
                     CAST(json_extract(value, '$.equipmentId') AS INTEGER),
                     CAST(json_extract(value, '$.isManual') AS INTEGER),
                     CAST(json_extract(value, '$.isService') AS INTEGER),
                     json_extract(value, '$.serviceId'),
                     CAST(json_extract(value, '$.serviceWidth') AS REAL),
                     CAST(json_extract(value, '$.serviceHeight') AS REAL),
                     json_extract(value, '$.category'),
                     json_extract(value, '$.description'),
                     CAST(json_extract(value, '$.quantity') AS INTEGER),
                     CAST(json_extract(value, '$.dailyUnits') AS INTEGER),
                     CAST(json_extract(value, '$.internalUnitPrice') AS REAL),
                     CAST(json_extract(value, '$.internalTotal') AS REAL),
                     CAST(json_extract(value, '$.sortOrder') AS INTEGER)
              FROM json_each(?)${useLastInsertedQuote ? " CROSS JOIN new_quote" : ""}
              ORDER BY CAST(key AS INTEGER)`,
    params: useLastInsertedQuote ? [serializedItems] : [quoteId, serializedItems]
  };
}
__name(quoteItemsInsertOperation, "quoteItemsInsertOperation");
function quoteTechniciansInsertOperation(quoteId, technicians) {
  if (!technicians.length) return null;
  const useLastInsertedQuoteItem = quoteId === null;
  const serializedTechnicians = JSON.stringify(technicians.map((technician) => ({
    operatorId: technician.operatorId,
    operatorName: technician.operatorName,
    dailyUnits: technician.dailyUnits,
    cacheValue: technician.cacheValue,
    sortOrder: technician.sortOrder
  })));
  return {
    sql: `${useLastInsertedQuoteItem ? `WITH new_quote(quote_id) AS MATERIALIZED (
                SELECT quote_id FROM quote_items WHERE id = last_insert_rowid()
              )` : ""}
              INSERT INTO quote_technicians (
                quote_id,
                operator_id,
                operator_name,
                daily_units,
                cache_value,
                sort_order
              )
              SELECT ${useLastInsertedQuoteItem ? "new_quote.quote_id" : "?"},
                     CAST(json_extract(value, '$.operatorId') AS INTEGER),
                     json_extract(value, '$.operatorName'),
                     CAST(json_extract(value, '$.dailyUnits') AS INTEGER),
                     CAST(json_extract(value, '$.cacheValue') AS REAL),
                     CAST(json_extract(value, '$.sortOrder') AS INTEGER)
              FROM json_each(?)${useLastInsertedQuoteItem ? " CROSS JOIN new_quote" : ""}
              ORDER BY CAST(key AS INTEGER)`,
    params: useLastInsertedQuoteItem ? [serializedTechnicians] : [quoteId, serializedTechnicians]
  };
}
__name(quoteTechniciansInsertOperation, "quoteTechniciansInsertOperation");
async function handleQuoteList(db, url, sendJson) {
  const status = String(url.searchParams.get("status") || "pending").trim().toLowerCase() === "approved" ? "approved" : "pending";
  const quotes = await db.queryAll(
    `SELECT quotes.id,
                quotes.client_name AS clientName,
                quotes.event_name AS eventName,
                quotes.event_location AS eventLocation,
                quotes.event_datetime AS eventDatetime,
                quotes.assembly_datetime AS assemblyDatetime,
                quotes.disassembly_datetime AS disassemblyDatetime,
                quotes.final_total AS finalTotal,
                COALESCE(quotes.status, 'pending') AS status,
                quotes.approved_at AS approvedAt,
                quotes.created_by_username AS createdByUsername,
                quotes.created_at AS createdAt,
                COUNT(quote_items.id) AS itemCount
         FROM quotes
         LEFT JOIN quote_items ON quote_items.quote_id = quotes.id
         WHERE quotes.status = ?
         GROUP BY quotes.id
         ORDER BY ${status === "approved" ? "datetime(quotes.approved_at) DESC," : ""}
                  quotes.created_at DESC,
                  quotes.id DESC`,
    [status]
  );
  return sendJson({ quotes });
}
__name(handleQuoteList, "handleQuoteList");
async function handleQuoteCreate(db, request, session, helpers, sendJson) {
  const body = await readRequestJson(request, helpers);
  const { quote, items, technicians, eventRange } = await normalizeQuotePayload(db, body);
  const conflict = await findQuoteItemsDateConflict(db, items, eventRange);
  if (conflict) return dateConflictResponse(conflict, sendJson);
  const [created] = await db.batch([
    {
      sql: `INSERT INTO quotes (
                proposal_city,
                proposal_date,
                client_name,
                event_name,
                event_location,
                event_datetime,
                assembly_datetime,
                disassembly_datetime,
                payment_method,
                payment_deadline,
                logistics_price,
                technicians_price,
                subtotal,
                final_total,
                show_item_prices,
                notes,
                created_by_username
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id`,
      params: [
        quote.proposalCity,
        quote.proposalDate,
        quote.clientName,
        quote.eventName,
        quote.eventLocation,
        quote.eventDatetime,
        quote.assemblyDatetime,
        quote.disassemblyDatetime,
        quote.paymentMethod,
        quote.paymentDeadline,
        quote.logisticsPrice,
        quote.techniciansPrice,
        quote.subtotal,
        quote.finalTotal,
        quote.showItemPrices ? 1 : 0,
        quote.notes,
        session?.username || null
      ]
    },
    // Os itens são obrigatórios e capturam o id do pai recém-inserido. A
    // operação de técnicos recupera esse mesmo pai a partir do último item.
    quoteItemsInsertOperation(null, items),
    quoteTechniciansInsertOperation(null, technicians)
  ].filter(Boolean));
  const quoteId = Number(created?.results?.[0]?.id ?? created?.meta?.last_row_id);
  if (!Number.isInteger(quoteId) || quoteId <= 0) {
    throw new Error("N\xE3o foi poss\xEDvel obter o identificador do or\xE7amento criado");
  }
  return sendJson({ id: quoteId, success: true });
}
__name(handleQuoteCreate, "handleQuoteCreate");
async function handleQuoteGet(db, params, sendJson) {
  const { quoteId } = params;
  if (!Number.isInteger(quoteId) || quoteId <= 0) {
    return sendJson({ error: "Or\xE7amento inv\xE1lido" }, 400);
  }
  const quote = await getQuoteWithItems(db, quoteId);
  if (!quote) return sendJson({ error: "Or\xE7amento n\xE3o encontrado" }, 404);
  return sendJson({ quote });
}
__name(handleQuoteGet, "handleQuoteGet");
async function handleQuoteUpdate(db, request, params, helpers, sendJson) {
  const { quoteId } = params;
  if (!Number.isInteger(quoteId) || quoteId <= 0) {
    return sendJson({ error: "Or\xE7amento inv\xE1lido" }, 400);
  }
  const body = await readRequestJson(request, helpers);
  const { quote, items, technicians, eventRange } = await normalizeQuotePayload(db, body);
  const existingQuote = await db.queryFirst(
    `SELECT quotes.id,
                COALESCE(quotes.status, 'pending') AS status,
                events.id AS eventId
         FROM quotes
         LEFT JOIN events ON events.orcamento_id = quotes.id
         WHERE quotes.id = ?`,
    [quoteId]
  );
  if (!existingQuote) return sendJson({ error: "Or\xE7amento n\xE3o encontrado" }, 404);
  if (!["pending", "approved"].includes(existingQuote.status)) {
    return sendJson({ error: "Este or\xE7amento n\xE3o pode ser editado." }, 409);
  }
  const isApproved = existingQuote.status === "approved";
  const eventId = Number(existingQuote.eventId);
  if (isApproved) {
    const paidTechnician = await db.queryFirst(
      `SELECT id
             FROM quote_technicians
             WHERE quote_id = ? AND paid_at IS NOT NULL
             LIMIT 1`,
      [quoteId]
    );
    if (paidTechnician) {
      return sendJson({
        error: "Este or\xE7amento possui pagamento de t\xE9cnico registrado. Corrija o pagamento antes de editar."
      }, 409);
    }
    if (Number.isInteger(eventId) && eventId > 0) {
      const movementHistory = await db.queryFirst(
        `SELECT (
                        SELECT COUNT(*) FROM equipment_events WHERE event_id = ?
                    ) + (
                        SELECT COUNT(*) FROM cable_event_movements WHERE event_id = ?
                    ) + (
                        SELECT COUNT(*) FROM other_item_event_movements WHERE event_id = ?
                    ) + (
                        SELECT COUNT(*) FROM quote_manual_item_movements WHERE event_id = ?
                    ) AS movementCount`,
        [eventId, eventId, eventId, eventId]
      );
      if (Number(movementHistory?.movementCount) > 0) {
        return sendJson({
          error: "Este or\xE7amento j\xE1 possui movimenta\xE7\xF5es no evento e n\xE3o pode ser editado."
        }, 409);
      }
    }
  }
  const conflict = await findQuoteItemsDateConflict(db, items, eventRange, {
    excludeQuoteId: quoteId,
    excludeEventId: eventId
  });
  if (conflict) return dateConflictResponse(conflict, sendJson);
  const newEquipmentIds = [...new Set(items.map((item) => Number(item.equipmentId)).filter(Boolean))];
  const operations = [
    {
      sql: `UPDATE quotes
                  SET proposal_city = ?,
                      proposal_date = ?,
                      client_name = ?,
                      event_name = ?,
                      event_location = ?,
                      event_datetime = ?,
                      assembly_datetime = ?,
                      disassembly_datetime = ?,
                      payment_method = ?,
                      payment_deadline = ?,
                      logistics_price = ?,
                      technicians_price = ?,
                      subtotal = ?,
                      final_total = ?,
                      show_item_prices = ?,
                      notes = ?,
                      updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?`,
      params: [
        quote.proposalCity,
        quote.proposalDate,
        quote.clientName,
        quote.eventName,
        quote.eventLocation,
        quote.eventDatetime,
        quote.assemblyDatetime,
        quote.disassemblyDatetime,
        quote.paymentMethod,
        quote.paymentDeadline,
        quote.logisticsPrice,
        quote.techniciansPrice,
        quote.subtotal,
        quote.finalTotal,
        quote.showItemPrices ? 1 : 0,
        quote.notes,
        quoteId
      ]
    },
    {
      sql: `UPDATE equipments
                  SET current_status = 'Disponivel'
                  WHERE current_status = 'Agendado'
                    AND id IN (
                        SELECT equipment_id
                        FROM quote_items
                        WHERE quote_id = ? AND equipment_id IS NOT NULL
                    )
                    AND id NOT IN (
                        SELECT CAST(value AS INTEGER) FROM json_each(?)
                    )`,
      params: [quoteId, JSON.stringify(newEquipmentIds)]
    },
    {
      sql: `DELETE FROM quote_manual_item_movements
                  WHERE quote_item_id IN (SELECT id FROM quote_items WHERE quote_id = ?)`,
      params: [quoteId]
    },
    {
      sql: `DELETE FROM event_reserved_equipments
                  WHERE ${Number.isInteger(eventId) && eventId > 0 ? "event_id = ?" : "quote_item_id IN (SELECT id FROM quote_items WHERE quote_id = ?)"}`,
      params: [Number.isInteger(eventId) && eventId > 0 ? eventId : quoteId]
    },
    { sql: "DELETE FROM quote_items WHERE quote_id = ?", params: [quoteId] },
    { sql: "DELETE FROM quote_technicians WHERE quote_id = ?", params: [quoteId] },
    quoteItemsInsertOperation(quoteId, items),
    quoteTechniciansInsertOperation(quoteId, technicians),
    Number.isInteger(eventId) && eventId > 0 ? {
      sql: `UPDATE events
                  SET name = ?, date = ?, end_date = ?
                  WHERE id = ?`,
      params: [quote.eventName || `Or\xE7amento ${quoteId}`, eventRange.start, eventRange.end, eventId]
    } : null
  ].filter(Boolean);
  await db.batch(operations);
  if (isApproved && (!Number.isInteger(eventId) || eventId <= 0)) {
    await ensureAutomaticScheduledEventsDb(db);
  }
  return sendJson({ id: quoteId, success: true, status: existingQuote.status });
}
__name(handleQuoteUpdate, "handleQuoteUpdate");
async function ensureAutomaticScheduledEventsDb(db) {
  const today = getTodayDateInput();
  const nextWeek = addDaysToDateKey(today, 7);
  const quotes = await db.queryAll(
    `SELECT quotes.id,
                quotes.event_name AS eventName,
                quotes.event_datetime AS eventDatetime,
                quotes.assembly_datetime AS assemblyDatetime,
                quotes.disassembly_datetime AS disassemblyDatetime,
                quotes.created_by_username AS createdByUsername,
                events.id AS eventId,
                events.name AS currentEventName,
                events.date AS currentEventDate,
                events.end_date AS currentEventEndDate,
                (
                    SELECT COUNT(*) FROM equipment_events WHERE event_id = events.id
                ) + (
                    SELECT COUNT(*) FROM cable_event_movements WHERE event_id = events.id
                ) + (
                    SELECT COUNT(*) FROM other_item_event_movements WHERE event_id = events.id
                ) + (
                    SELECT COUNT(*) FROM quote_manual_item_movements WHERE event_id = events.id
                ) AS movementCount
         FROM quotes
         LEFT JOIN events ON events.orcamento_id = quotes.id
         WHERE quotes.status = 'approved'
         ORDER BY quotes.approved_at ASC, quotes.id ASC`
  );
  const eventsToCreate = [];
  const existingEventsToUpdate = [];
  for (const quote of quotes) {
    const range = getQuoteOperationalRange(quote);
    if (!range) continue;
    if (Number(quote.eventId) > 0) {
      const expectedName = quote.eventName || `Or\xC3\xA7amento ${quote.id}`;
      const eventMetadataChanged = String(quote.currentEventName || "") !== String(expectedName) || String(quote.currentEventDate || "") !== String(range.start) || String(quote.currentEventEndDate || "") !== String(range.end);
      if (Number(quote.movementCount) === 0 && eventMetadataChanged) {
        existingEventsToUpdate.push({
          eventId: Number(quote.eventId),
          name: expectedName,
          start: range.start,
          end: range.end
        });
      }
      continue;
    }
    if (range.start > nextWeek || range.end < today) continue;
    eventsToCreate.push({
      name: quote.eventName || `Or\xE7amento ${quote.id}`,
      start: range.start,
      end: range.end,
      createdByUsername: quote.createdByUsername || "sistema",
      quoteId: Number(quote.id)
    });
  }
  if (existingEventsToUpdate.length) {
    await db.batch(existingEventsToUpdate.map((event) => ({
      sql: `UPDATE events SET name = ?, date = ?, end_date = ? WHERE id = ?`,
      params: [event.name, event.start, event.end, event.eventId]
    })));
  }
  for (let index = 0; index < eventsToCreate.length; index += 20) {
    const chunk = eventsToCreate.slice(index, index + 20);
    const params = [];
    const values = chunk.map((event) => {
      params.push(
        event.name,
        event.start,
        event.end,
        event.createdByUsername,
        event.quoteId
      );
      return "(?, ?, ?, ?, 'event', ?, CURRENT_TIMESTAMP)";
    });
    await db.execute(
      `INSERT OR IGNORE INTO events (
                name,
                date,
                end_date,
                created_by_username,
                event_type,
                orcamento_id,
                auto_created_at
             ) VALUES ${values.join(", ")}`,
      params
    );
  }
}
__name(ensureAutomaticScheduledEventsDb, "ensureAutomaticScheduledEventsDb");
async function handleQuoteReady(db, params, sendJson) {
  const { quoteId } = params;
  if (!Number.isInteger(quoteId) || quoteId <= 0) {
    return sendJson({ error: "Or\xE7amento inv\xE1lido" }, 400);
  }
  const quote = await db.queryFirst(
    'SELECT id, COALESCE(status, "pending") AS status FROM quotes WHERE id = ?',
    [quoteId]
  );
  if (!quote) return sendJson({ error: "Or\xE7amento n\xE3o encontrado" }, 404);
  await db.execute(
    `UPDATE quotes
         SET status = 'approved',
             approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
    [quoteId]
  );
  await ensureAutomaticScheduledEventsDb(db);
  return sendJson({ success: true, id: quoteId, status: "approved" });
}
__name(handleQuoteReady, "handleQuoteReady");
async function handleQuoteDelete(db, params, sendJson) {
  const { quoteId } = params;
  if (!Number.isInteger(quoteId) || quoteId <= 0) {
    return sendJson({ error: "Or\xE7amento inv\xE1lido" }, 400);
  }
  const quote = await db.queryFirst("SELECT id FROM quotes WHERE id = ?", [quoteId]);
  if (!quote) return sendJson({ error: "Or\xE7amento n\xE3o encontrado" }, 404);
  const automaticEvent = await db.queryFirst("SELECT id FROM events WHERE orcamento_id = ?", [quoteId]);
  const eventId = Number(automaticEvent?.id);
  await db.batch([
    // O pai é removido primeiro para que o trigger 0030 valide pagamentos e
    // movimentos enquanto todos os filhos ainda existem. Qualquer conflito
    // aborta e reverte o batch inteiro.
    { sql: "DELETE FROM quotes WHERE id = ?", params: [quoteId] },
    {
      sql: `UPDATE equipments
                  SET current_status = 'Disponivel'
                  WHERE current_status = 'Agendado'
                    AND id IN (
                        SELECT equipment_id
                        FROM quote_items
                        WHERE quote_id = ? AND equipment_id IS NOT NULL
                    )`,
      params: [quoteId]
    },
    {
      sql: `DELETE FROM quote_manual_item_movements
                  WHERE quote_item_id IN (SELECT id FROM quote_items WHERE quote_id = ?)`,
      params: [quoteId]
    },
    {
      sql: `DELETE FROM event_reserved_equipments
                  WHERE quote_item_id IN (SELECT id FROM quote_items WHERE quote_id = ?)
                     OR (? > 0 AND event_id = ?)`,
      params: [quoteId, eventId || 0, eventId || 0]
    },
    eventId > 0 ? { sql: "DELETE FROM event_saida_hidden_items WHERE event_id = ?", params: [eventId] } : null,
    eventId > 0 ? { sql: "DELETE FROM event_spaces WHERE event_id = ?", params: [eventId] } : null,
    eventId > 0 ? { sql: "DELETE FROM events WHERE id = ?", params: [eventId] } : null,
    { sql: "DELETE FROM quote_technicians WHERE quote_id = ?", params: [quoteId] },
    { sql: "DELETE FROM quote_items WHERE quote_id = ?", params: [quoteId] }
  ].filter(Boolean));
  return sendJson({ success: true });
}
__name(handleQuoteDelete, "handleQuoteDelete");
async function handleScheduledEvents(db, sendJson) {
  await ensureAutomaticScheduledEventsDb(db);
  const [events, reservedEquipments, movements] = await Promise.all([
    db.queryAll(
      `SELECT events.id,
                events.name,
                events.date,
                events.end_date AS endDate,
                events.orcamento_id AS quoteId,
                events.auto_created_at AS autoCreatedAt,
                quotes.event_name AS quoteEventName,
                quotes.client_name AS clientName
         FROM events
         INNER JOIN quotes ON quotes.id = events.orcamento_id
         WHERE events.orcamento_id IS NOT NULL
         ORDER BY events.date ASC, events.id ASC`
    ),
    db.queryAll(
      `SELECT reserved.event_id AS eventId,
                    equipments.id,
                    equipments.name,
                    equipments.barcode,
                    COALESCE(equipments.category, 'Outros') AS category
             FROM event_reserved_equipments reserved
             INNER JOIN equipments ON equipments.id = reserved.equipment_id
             INNER JOIN events ON events.id = reserved.event_id
             WHERE events.orcamento_id IS NOT NULL
             ORDER BY lower(equipments.name) ASC, equipments.barcode ASC`
    ),
    db.queryAll(
      `SELECT all_movements.event_id AS eventId,
                    SUM(all_movements.movementCount) AS movementCount,
                    SUM(all_movements.pendingQuantity) AS pendingQuantity
             FROM (
                 SELECT event_id,
                        COUNT(*) AS movementCount,
                        SUM(CASE WHEN action_type = 'saida' THEN 1 ELSE -1 END) AS pendingQuantity
                 FROM equipment_events
                 GROUP BY event_id
                 UNION ALL
                 SELECT event_id,
                        COUNT(*) AS movementCount,
                        SUM(CASE
                            WHEN action_type = 'saida' THEN quantity
                            ELSE -quantity
                        END) AS pendingQuantity
                 FROM quote_manual_item_movements
                 GROUP BY event_id
             ) AS all_movements
             INNER JOIN events ON events.id = all_movements.event_id
             WHERE events.orcamento_id IS NOT NULL
             GROUP BY all_movements.event_id`
    )
  ]);
  const reservedByEvent = /* @__PURE__ */ new Map();
  for (const equipment of reservedEquipments) {
    const eventId = Number(equipment.eventId);
    if (!reservedByEvent.has(eventId)) reservedByEvent.set(eventId, []);
    const { eventId: ignoredEventId, ...serializedEquipment } = equipment;
    reservedByEvent.get(eventId).push(serializedEquipment);
  }
  const movementByEvent = new Map(movements.map((movement) => [Number(movement.eventId), movement]));
  for (const event of events) {
    event.reservedEquipments = reservedByEvent.get(Number(event.id)) || [];
    const movement = movementByEvent.get(Number(event.id));
    const movementCount = Number(movement?.movementCount) || 0;
    const pendingQuantity = Number(movement?.pendingQuantity) || 0;
    event.status = movementCount === 0 ? "Agendado" : pendingQuantity > 0 ? "Em andamento" : "Finalizado";
  }
  return sendJson({ events });
}
__name(handleScheduledEvents, "handleScheduledEvents");
async function handleQuoteManualSummary(db, params, sendJson) {
  const { eventId } = params;
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return sendJson({ error: "Evento inv\xE1lido" }, 400);
  }
  const rows = await db.queryAll(
    `SELECT quote_items.id AS quote_item_id,
                movements.space_id,
                event_spaces.name AS space_name,
                quote_items.description AS name,
                quote_items.quantity AS requested_quantity,
                COALESCE(SUM(CASE WHEN movements.action_type = 'saida' THEN movements.quantity ELSE 0 END), 0) AS saida,
                COALESCE(SUM(CASE WHEN movements.action_type = 'entrada' THEN movements.quantity ELSE 0 END), 0) AS entrada,
                COALESCE(SUM(CASE
                    WHEN movements.action_type = 'saida' THEN movements.quantity
                    WHEN movements.action_type = 'entrada' THEN -movements.quantity
                    ELSE 0
                END), 0) AS final
         FROM events
         INNER JOIN quote_items ON quote_items.quote_id = events.orcamento_id
         LEFT JOIN quote_manual_item_movements movements
           ON movements.event_id = events.id
          AND movements.quote_item_id = quote_items.id
         LEFT JOIN event_spaces ON event_spaces.id = movements.space_id
         WHERE events.id = ?
           AND COALESCE(quote_items.is_manual, 0) = 1
         GROUP BY quote_items.id,
                  movements.space_id,
                  event_spaces.name,
                  quote_items.description,
                  quote_items.quantity
         ORDER BY COALESCE(event_spaces.id, 0) ASC,
                  lower(quote_items.description) ASC,
                  quote_items.id ASC`,
    [eventId]
  );
  return sendJson(rows);
}
__name(handleQuoteManualSummary, "handleQuoteManualSummary");
function parseOptionalSpaceId(value) {
  if (value === void 0 || value === null || value === "") return null;
  const spaceId = Number(value);
  return Number.isInteger(spaceId) && spaceId > 0 ? spaceId : NaN;
}
__name(parseOptionalSpaceId, "parseOptionalSpaceId");
async function resolveEventSpaceId(db, eventId, value) {
  const spaceId = parseOptionalSpaceId(value);
  if (Number.isNaN(spaceId)) throw httpError("Espa\xE7o inv\xE1lido", 400);
  if (spaceId === null) return null;
  const space = await db.queryFirst(
    "SELECT id FROM event_spaces WHERE id = ? AND event_id = ?",
    [spaceId, eventId]
  );
  if (!space) throw httpError("Espa\xE7o n\xE3o encontrado neste evento", 404);
  return spaceId;
}
__name(resolveEventSpaceId, "resolveEventSpaceId");
function getQuoteMutationRequestId(request, body = {}) {
  const supplied = String(
    request.headers.get("Idempotency-Key") || body.requestId || body.request_id || ""
  ).trim();
  if (!supplied) return crypto.randomUUID();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(supplied)) {
    throw httpError("Chave de idempot\xEAncia inv\xE1lida", 400);
  }
  return supplied;
}
__name(getQuoteMutationRequestId, "getQuoteMutationRequestId");
function isUniqueConstraintError(error) {
  return getD1ErrorMessage(error).toLowerCase().includes("unique constraint failed");
}
__name(isUniqueConstraintError, "isUniqueConstraintError");
function isSameQuoteManualMovement(row, expected) {
  return Number(row?.quoteItemId) === expected.quoteItemId && Number(row?.eventId) === expected.eventId && Number(row?.spaceId || 0) === Number(expected.spaceId || 0) && String(row?.actionType || "") === expected.type && Number(row?.quantity) === expected.quantity;
}
__name(isSameQuoteManualMovement, "isSameQuoteManualMovement");
function assertQuoteManualMovementReplay(row, expected) {
  if (!isSameQuoteManualMovement(row, expected)) {
    throw httpError("Esta chave de idempot\xEAncia j\xE1 foi usada em outra movimenta\xE7\xE3o", 409);
  }
  return { replayed: true, result: null };
}
__name(assertQuoteManualMovementReplay, "assertQuoteManualMovementReplay");
async function executeIdempotentQuoteManualMovement(db, options) {
  const { requestId, expected, sql, params } = options;
  const findExisting = /* @__PURE__ */ __name(() => db.queryFirst(
    `SELECT id,
                quote_item_id AS quoteItemId,
                event_id AS eventId,
                space_id AS spaceId,
                action_type AS actionType,
                quantity
         FROM quote_manual_item_movements
         WHERE request_id = ?`,
    [requestId]
  ), "findExisting");
  return withD1Retry(async () => {
    const existing = await findExisting();
    if (existing) return assertQuoteManualMovementReplay(existing, expected);
    try {
      return {
        replayed: false,
        result: await db.execute(sql, params)
      };
    } catch (error) {
      if (!isD1UnavailableError(error) && !isUniqueConstraintError(error)) {
        throw error;
      }
      try {
        const committed = await findExisting();
        if (committed) return assertQuoteManualMovementReplay(committed, expected);
      } catch (verificationError) {
        throw verificationError;
      }
      throw error;
    }
  }, {
    maxAttempts: 6,
    baseDelayMs: 50,
    maxDelayMs: 800,
    onRetry: /* @__PURE__ */ __name(({ attempt, delayMs, error }) => {
      console.warn(JSON.stringify({
        message: "d1 transient error; retry scheduled",
        operation: `quote-manual-item-${expected.type}`,
        attempt,
        delayMs,
        error: getD1ErrorMessage(error)
      }));
    }, "onRetry")
  });
}
__name(executeIdempotentQuoteManualMovement, "executeIdempotentQuoteManualMovement");
async function handleQuoteManualMovement(db, request, params, helpers, sendJson) {
  const body = await readRequestJson(request, helpers);
  const { type } = params;
  const quoteItemId = Number(body.quoteItemId);
  const eventId = Number(body.eventId);
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quoteItemId) || quoteItemId <= 0 || !Number.isInteger(eventId) || eventId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
    return sendJson({ message: "quoteItemId, eventId e quantidade s\xE3o obrigat\xF3rios" }, 400);
  }
  const requestId = getQuoteMutationRequestId(request, body);
  const quoteItem = await db.queryFirst(
    `SELECT quote_items.id,
                quote_items.description,
                quote_items.quantity
         FROM quote_items
         INNER JOIN events ON events.orcamento_id = quote_items.quote_id
         WHERE quote_items.id = ?
           AND events.id = ?
           AND COALESCE(quote_items.is_manual, 0) = 1`,
    [quoteItemId, eventId]
  );
  if (!quoteItem) {
    return sendJson({ message: "Equipamento avulso n\xE3o encontrado neste evento" }, 404);
  }
  const spaceId = await resolveEventSpaceId(db, eventId, body.spaceId);
  const expected = { quoteItemId, eventId, spaceId, type, quantity };
  let mutation;
  if (type === "saida") {
    mutation = await executeIdempotentQuoteManualMovement(db, {
      requestId,
      expected,
      sql: `INSERT INTO quote_manual_item_movements (
                    quote_item_id, event_id, space_id, action_type, quantity, request_id
                  )
                  SELECT ?, ?, ?, 'saida', ?, ?
                  WHERE (
                      SELECT COALESCE(SUM(CASE
                          WHEN action_type = 'saida' THEN quantity
                          WHEN action_type = 'entrada' THEN -quantity
                          ELSE 0
                      END), 0)
                      FROM quote_manual_item_movements
                      WHERE quote_item_id = ? AND event_id = ?
                  ) + ? <= ?`,
      params: [
        quoteItemId,
        eventId,
        spaceId,
        quantity,
        requestId,
        quoteItemId,
        eventId,
        quantity,
        Number(quoteItem.quantity)
      ]
    });
    if (!mutation.replayed && getChangedRowCount(mutation.result) !== 1) {
      return sendJson({ message: "A quantidade de sa\xEDda ultrapassa a quantidade informada no or\xE7amento" }, 409);
    }
  } else {
    mutation = await executeIdempotentQuoteManualMovement(db, {
      requestId,
      expected,
      sql: `INSERT INTO quote_manual_item_movements (
                    quote_item_id, event_id, space_id, action_type, quantity, request_id
                  )
                  SELECT ?, ?, ?, 'entrada', ?, ?
                  WHERE (
                      SELECT COALESCE(SUM(CASE
                          WHEN action_type = 'saida' THEN quantity
                          ELSE -quantity
                      END), 0)
                      FROM quote_manual_item_movements
                      WHERE quote_item_id = ?
                        AND event_id = ?
                        AND COALESCE(space_id, 0) = COALESCE(?, 0)
                  ) >= ?`,
      params: [
        quoteItemId,
        eventId,
        spaceId,
        quantity,
        requestId,
        quoteItemId,
        eventId,
        spaceId,
        quantity
      ]
    });
    if (!mutation.replayed && getChangedRowCount(mutation.result) !== 1) {
      return sendJson({ message: "Este equipamento avulso n\xE3o possui sa\xEDda pendente suficiente neste evento" }, 409);
    }
  }
  return sendJson({ success: true, requestId, replayed: mutation.replayed });
}
__name(handleQuoteManualMovement, "handleQuoteManualMovement");
function getChangedRowCount(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}
__name(getChangedRowCount, "getChangedRowCount");
async function handleQuotePdf(db, request, env, executionCtx, params, sendJson) {
  const { quoteId } = params;
  if (!Number.isInteger(quoteId) || quoteId <= 0) {
    return sendJson({ error: "Or\xE7amento inv\xE1lido" }, 400);
  }
  const quote = await db.queryFirst("SELECT id FROM quotes WHERE id = ?", [quoteId]);
  if (!quote) return sendJson({ error: "Or\xE7amento n\xE3o encontrado" }, 404);
  return new Response(`<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gerando PDF...</title></head>
<body data-quote-pdf-id="${quoteId}"><p>Gerando PDF do or\xE7amento...</p><script src="/javascript/quote-pdf-client.js?v=20260807-client-render"><\/script></body>
</html>`, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "private, no-store",
      "X-Quote-PDF-Renderer": "browser"
    }
  });
}
__name(handleQuotePdf, "handleQuotePdf");

// src/worker.mjs
var SESSION_COOKIE_NAME = "sessao24h";
var SESSION_DURATION_SECONDS = 60 * 60 * 24;
var TEST_USERNAME = "teste";
var INITIAL_QUANTITY_EDITOR_USERNAME = "arthur";
var INITIAL_QUANTITY_EDIT_PASSWORD = "3418";
var USER_ROLES2 = /* @__PURE__ */ new Set(["admin", "user", "comercial"]);
var OPERATOR_PHOTO_MAX_LENGTH = 25e5;
var OPERATOR_PHOTO_PATTERN = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
var PRICE_TABLES = {
  equipment: {
    table: "equipments",
    categoryColumn: "category"
  },
  cable: {
    table: "cables",
    categoryColumn: "category"
  },
  other: {
    table: "other_items",
    categoryColumn: "category"
  }
};
var PROTECTED_PAGES = /* @__PURE__ */ new Set([
  "/dashboard.html",
  "/event.html",
  "/entrada.html",
  "/saida.html"
]);
var PAGE_ASSET_PATHS = /* @__PURE__ */ new Map([
  ["/index.html", "/html/index.html"],
  ["/login.html", "/html/login.html"],
  ["/dashboard.html", "/html/dashboard.html"],
  ["/event.html", "/html/event.html"],
  ["/entrada.html", "/html/entrada.html"],
  ["/saida.html", "/html/saida.html"]
]);
var LEGACY_ASSET_PATHS = /* @__PURE__ */ new Map([
  ["/dashboard.css", "/css/dashboard.css"],
  ["/event.css", "/css/event.css"],
  ["/login.css", "/css/login.css"],
  ["/style.css", "/css/style.css"],
  ["/dashboard.js", "/javascript/dashboard.js"],
  ["/event.js", "/javascript/event.js"],
  ["/login.js", "/javascript/login.js"],
  ["/script.js", "/javascript/script.js"],
  ["/logo.PNG", "/fotos/logo.PNG"],
  ["/quote-header.png", "/fotos/quote-header.png"],
  ["/quote-signature.png", "/fotos/quote-signature.png"]
]);
var worker_default = {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) {
        return await handleApiRequest(request, env, ctx);
      }
      return await handlePageRequest(request, env);
    } catch (error) {
      if (isD1WriteOutcomeUnknownError(error)) {
        return databaseWriteOutcomeUnknownResponse(error, request);
      }
      if (isD1UnavailableError(error)) {
        return databaseUnavailableResponse(error, request);
      }
      if (getD1LedgerConflictCode(error)) {
        return databaseIntegrityConflictResponse(error, request);
      }
      console.error(JSON.stringify({
        message: "worker request failed",
        method: request.method,
        path: new URL(request.url).pathname,
        requestId: getRequestId(request),
        error: error instanceof Error ? error.message : String(error)
      }));
      if (error?.statusCode) {
        return json2({ message: error.message }, error.statusCode);
      }
      return json2({ error: "Erro interno do servidor" }, 500);
    }
  }
};
async function handlePageRequest(request, env) {
  const url = new URL(request.url);
  const session = await getSessionFromRequest(request, env);
  const publicPathname = normalizePublicPagePath(url.pathname);
  if ((publicPathname === "/index.html" || publicPathname === "/login.html") && session) {
    return Response.redirect(new URL("/dashboard.html", url.origin), 302);
  }
  if (PROTECTED_PAGES.has(publicPathname) && !session) {
    return Response.redirect(new URL("/login.html", url.origin), 302);
  }
  const assetPath = PAGE_ASSET_PATHS.get(publicPathname) || LEGACY_ASSET_PATHS.get(url.pathname);
  if (assetPath) {
    return fetchAssetPath(request, env, assetPath);
  }
  return env.ASSETS.fetch(request);
}
__name(handlePageRequest, "handlePageRequest");
function normalizePublicPagePath(pathname) {
  if (pathname === "/") {
    return "/index.html";
  }
  if (pathname.startsWith("/html/")) {
    return `/${pathname.slice("/html/".length)}`;
  }
  return pathname;
}
__name(normalizePublicPagePath, "normalizePublicPagePath");
function fetchAssetPath(request, env, pathname) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = pathname;
  return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
}
__name(fetchAssetPath, "fetchAssetPath");
async function handleApiRequest(request, env, ctx) {
  const url = new URL(request.url);
  const { pathname } = url;
  if (pathname === "/api/login" && request.method === "POST") {
    return login(request, env);
  }
  if (pathname === "/api/logout" && request.method === "POST") {
    return logout(request, env);
  }
  if (pathname === "/api/auth/status" && request.method === "GET") {
    const session2 = await getSessionFromRequest(request, env);
    const role = normalizeUserRole2(session2?.role);
    return json2({
      authenticated: !!session2,
      isTestUser: session2?.username === TEST_USERNAME,
      userId: session2?.user_id || null,
      username: session2?.username || null,
      role: session2 ? role : null,
      isAdmin: role === "admin",
      isCommercial: role === "comercial",
      canEditInitialQuantity: session2 ? canShowInitialQuantityEdit(session2.username) : false
    });
  }
  const session = await getSessionFromRequest(request, env);
  if (!session) {
    return json2({ error: "N\xE3o autorizado" }, 401);
  }
  if (session.username === TEST_USERNAME && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    return json2({ error: "O usu\xE1rio de teste possui acesso somente para consulta no site publicado." }, 403);
  }
  const quoteResponse = await handleQuoteRequest({
    request,
    env,
    executionCtx: ctx,
    session,
    url,
    helpers: {
      queryAll,
      queryFirst,
      execute,
      batch: executeBatch,
      json: json2,
      readJson,
      tableExists,
      tableHasColumn,
      ensureColumn
    }
  });
  if (quoteResponse) {
    return quoteResponse;
  }
  if (pathname === "/api/users" && request.method === "GET") {
    if (!isAdminSession2(session)) {
      return json2({ error: "Acesso restrito a administradores" }, 403);
    }
    const users = await queryAll(
      env,
      `SELECT id, username, COALESCE(role, 'user') AS role
             FROM users
             ORDER BY lower(username) ASC`
    );
    return json2({
      users,
      canChangePasswords: isAdminSession2(session)
    });
  }
  if (pathname === "/api/users" && request.method === "POST") {
    if (!isAdminSession2(session)) {
      return json2({ error: "Acesso restrito a administradores" }, 403);
    }
    const body = await readJson(request);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const role = normalizeUserRole2(body.role || "user");
    if (!username) return json2({ error: "Usu\xE1rio \xE9 obrigat\xF3rio" }, 400);
    if (password.trim().length < 4) {
      return json2({ error: "A senha deve ter pelo menos 4 caracteres" }, 400);
    }
    const existingUser = await queryFirst(env, "SELECT id FROM users WHERE lower(username) = lower(?)", [username]);
    if (existingUser) {
      return json2({ error: "J\xE1 existe um usu\xE1rio com esse nome" }, 409);
    }
    const passwordHash = import_bcryptjs.default.hashSync(password, 10);
    const result = await execute(
      env,
      "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
      [username, passwordHash, role]
    );
    return json2({ id: result.meta.last_row_id, username, role, success: true });
  }
  if (pathname === "/api/prices" && request.method === "GET") {
    if (!isAdminSession2(session)) {
      return json2({ error: "Acesso restrito a administradores" }, 403);
    }
    const type = String(url.searchParams.get("type") || "").trim().toLowerCase();
    const search = cleanText2(url.searchParams.get("search"), 120);
    const config = PRICE_TABLES[type];
    if (!config) {
      return json2({ error: "Tipo de item inv\xE1lido" }, 400);
    }
    const items = await getPriceItems(env, type, search);
    return json2({ type, items });
  }
  const priceMatch = pathname.match(/^\/api\/prices\/([^/]+)\/(\d+)$/);
  if (priceMatch && request.method === "PATCH") {
    if (!isAdminSession2(session)) {
      return json2({ error: "Acesso restrito a administradores" }, 403);
    }
    const type = String(priceMatch[1] || "").trim().toLowerCase();
    const itemId = Number(priceMatch[2]);
    const config = PRICE_TABLES[type];
    if (!config || !Number.isInteger(itemId) || itemId <= 0) {
      return json2({ error: "Item inv\xE1lido" }, 400);
    }
    const body = await readJson(request);
    const unitPrice = roundMoney2(parseMoneyValue2(body.unitPrice));
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return json2({ error: "Pre\xE7o inv\xE1lido" }, 400);
    }
    const item = await queryFirst(env, `SELECT id, name FROM ${config.table} WHERE id = ?`, [itemId]);
    if (!item) {
      return json2({ error: "Item n\xE3o encontrado" }, 404);
    }
    if (type === "equipment") {
      await execute(
        env,
        `UPDATE equipments SET unit_price = ? WHERE lower(trim(name)) = lower(trim(?))`,
        [unitPrice, item.name]
      );
    } else {
      await execute(env, `UPDATE ${config.table} SET unit_price = ? WHERE id = ?`, [unitPrice, itemId]);
    }
    return json2({ success: true, id: itemId, type, unitPrice });
  }
  if (pathname === "/api/scheduled-events" && request.method === "GET") {
    await ensureAutomaticScheduledEvents(env, {
      queryAll,
      queryFirst,
      execute,
      batch: executeBatch,
      tableExists,
      tableHasColumn,
      ensureColumn
    });
    return getScheduledEvents(env);
  }
  if (pathname === "/api/orcamentos/equipamentos-banco" && request.method === "GET") {
    if (!isAdminSession2(session)) {
      return json2({ error: "Acesso restrito a administradores" }, 403);
    }
    const search = cleanText2(url.searchParams.get("search"), 120);
    const equipments = await getQuoteDatabaseEquipments(env, search);
    return json2({ equipments });
  }
  const quoteEquipmentVisibilityMatch = pathname.match(/^\/api\/orcamentos\/equipamentos\/(\d+)\/(ocultar|restaurar)$/);
  if (quoteEquipmentVisibilityMatch && request.method === "POST") {
    if (!isAdminSession2(session)) {
      return json2({ error: "Acesso restrito a administradores" }, 403);
    }
    const equipmentId = Number(quoteEquipmentVisibilityMatch[1]);
    const action = quoteEquipmentVisibilityMatch[2];
    if (!Number.isInteger(equipmentId) || equipmentId <= 0) {
      return json2({ error: "Equipamento inv\xE1lido." }, 400);
    }
    const equipment = await queryFirst(env, "SELECT id FROM equipments WHERE id = ?", [equipmentId]);
    if (!equipment) {
      return json2({ error: "Equipamento n\xE3o encontrado." }, 404);
    }
    if (action === "ocultar") {
      await execute(
        env,
        `INSERT INTO quote_hidden_equipments (equipment_id, hidden_by_username)
                 VALUES (?, ?)
                 ON CONFLICT(equipment_id) DO UPDATE SET
                    hidden_by_username = excluded.hidden_by_username,
                    hidden_at = CURRENT_TIMESTAMP`,
        [equipmentId, session?.username || null]
      );
      return json2({ success: true, equipmentId, hiddenFromQuotes: true });
    }
    await execute(env, "DELETE FROM quote_hidden_equipments WHERE equipment_id = ?", [equipmentId]);
    return json2({ success: true, equipmentId, hiddenFromQuotes: false });
  }
  if (pathname === "/api/orcamentos/equipamentos-disponiveis" && request.method === "GET") {
    if (!canAccessQuotes2(session)) {
      return json2({ error: "Acesso restrito \xE0 tela de or\xE7amentos" }, 403);
    }
    const search = cleanText2(url.searchParams.get("search"), 120);
    if (!search) {
      return json2({ equipments: [] });
    }
    const equipments = await getAvailableQuoteEquipments(env, search);
    return json2({ equipments });
  }
  const userPasswordMatch = pathname.match(/^\/api\/users\/(\d+)\/password$/);
  if (userPasswordMatch && request.method === "PATCH") {
    if (!isAdminSession2(session)) {
      return json2({ error: "Acesso restrito a administradores" }, 403);
    }
    const userId = Number(userPasswordMatch[1]);
    const body = await readJson(request);
    const password = String(body.password || "");
    if (!userId) return json2({ error: "Usu\xE1rio inv\xE1lido" }, 400);
    if (password.trim().length < 4) {
      return json2({ error: "A senha deve ter pelo menos 4 caracteres" }, 400);
    }
    const user = await queryFirst(env, "SELECT id FROM users WHERE id = ?", [userId]);
    if (!user) return json2({ error: "Usu\xE1rio n\xE3o encontrado" }, 404);
    const passwordHash = import_bcryptjs.default.hashSync(password, 10);
    await executeBatch(env, [
      { sql: "UPDATE users SET password = ? WHERE id = ?", params: [passwordHash, userId] },
      { sql: "DELETE FROM sessions WHERE user_id = ?", params: [userId] }
    ]);
    return json2({ success: true });
  }
  const userMatch = pathname.match(/^\/api\/users\/(\d+)$/);
  if (userMatch && request.method === "DELETE") {
    if (!isAdminSession2(session)) {
      return json2({ error: "Acesso restrito a administradores" }, 403);
    }
    const userId = Number(userMatch[1]);
    if (!userId) return json2({ error: "Usu\xE1rio inv\xE1lido" }, 400);
    const user = await queryFirst(env, 'SELECT id, username, COALESCE(role, "user") AS role FROM users WHERE id = ?', [userId]);
    if (!user) return json2({ error: "Usu\xE1rio n\xE3o encontrado" }, 404);
    if (Number(user.id) === Number(session.user_id)) {
      return json2({ error: "Voc\xEA n\xE3o pode excluir seu pr\xF3prio usu\xE1rio" }, 400);
    }
    const [deleteUserResult] = await executeBatch(env, [
      {
        sql: `DELETE FROM users
                      WHERE id = ?
                        AND (
                            COALESCE(role, 'user') <> 'admin'
                            OR EXISTS (
                                SELECT 1 FROM users AS another_admin
                                WHERE another_admin.id <> users.id
                                  AND another_admin.role = 'admin'
                            )
                        )`,
        params: [userId]
      },
      {
        sql: `DELETE FROM sessions
                      WHERE user_id = ?
                        AND NOT EXISTS (SELECT 1 FROM users WHERE id = ?)`,
        params: [userId, userId]
      }
    ]);
    if (Number(deleteUserResult?.meta?.changes) === 0) {
      const remainingUser = await queryFirst(env, "SELECT id FROM users WHERE id = ?", [userId]);
      if (!remainingUser) {
        return json2({ success: true, replayed: true });
      }
      return json2({ error: "N\xE3o \xE9 poss\xEDvel excluir o \xFAltimo administrador" }, 409);
    }
    return json2({ success: true });
  }
  if (pathname === "/api/operators" && request.method === "GET") {
    if (!canAccessOperators(session)) {
      return json2({ error: "Acesso restrito a t\xE9cnicos" }, 403);
    }
    const search = cleanText2(url.searchParams.get("search"), 120);
    const rows = await queryAll(
      env,
      `SELECT id,
                    full_name AS fullName,
                    mother_name AS motherName,
                    cpf,
                    rg,
                    birth_date AS birthDate,
                    address,
                    email,
                    phone,
                    area,
                    has_vehicle AS hasVehicle,
                    pix,
                    agency,
                    photo,
                    cache_value AS cacheValue,
                    created_by_username AS createdByUsername,
                    created_at AS createdAt,
                    updated_at AS updatedAt
             FROM operators
             WHERE full_name LIKE ?
                OR mother_name LIKE ?
                OR cpf LIKE ?
                OR rg LIKE ?
                OR email LIKE ?
                OR phone LIKE ?
                OR area LIKE ?
             ORDER BY lower(full_name) ASC, id DESC`,
      [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
    );
    return json2({ operators: rows.map(serializeOperator2) });
  }
  if (pathname === "/api/operators" && request.method === "POST") {
    if (!canAccessOperators(session)) {
      return json2({ error: "Acesso restrito a t\xE9cnicos" }, 403);
    }
    const body = await readJson(request);
    let operatorData;
    try {
      operatorData = normalizeOperatorPayload(body, { requirePhoto: true });
    } catch (error) {
      return json2({ error: error.message }, error.statusCode || 400);
    }
    try {
      const result = await execute(
        env,
        `INSERT INTO operators (
                    full_name, mother_name, cpf, rg, birth_date, address, email, phone, area, has_vehicle, pix, agency,
                    photo, cache_value, created_by_username, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          operatorData.fullName,
          operatorData.motherName,
          operatorData.cpf,
          operatorData.rg,
          operatorData.birthDate,
          operatorData.address,
          operatorData.email,
          operatorData.phone,
          operatorData.area,
          operatorData.hasVehicle ? 1 : 0,
          operatorData.pix,
          operatorData.agency,
          operatorData.photo,
          operatorData.cacheValue,
          session?.username || null
        ]
      );
      return json2({ id: result.meta.last_row_id, success: true });
    } catch (error) {
      return handleDatabaseError(error, "J\xE1 existe um t\xE9cnico com esse CPF");
    }
  }
  const operatorMatch = pathname.match(/^\/api\/operators\/(\d+)$/);
  if (operatorMatch && request.method === "GET") {
    if (!canAccessOperators(session)) {
      return json2({ error: "Acesso restrito a t\xE9cnicos" }, 403);
    }
    const operatorId = Number(operatorMatch[1]);
    const row = await queryFirst(
      env,
      `SELECT id,
                    full_name AS fullName,
                    mother_name AS motherName,
                    cpf,
                    rg,
                    birth_date AS birthDate,
                    address,
                    email,
                    phone,
                    area,
                    has_vehicle AS hasVehicle,
                    pix,
                    agency,
                    photo,
                    cache_value AS cacheValue,
                    created_by_username AS createdByUsername,
                    created_at AS createdAt,
                    updated_at AS updatedAt
             FROM operators
             WHERE id = ?`,
      [operatorId]
    );
    if (!row) return json2({ error: "T\xE9cnico n\xE3o encontrado" }, 404);
    return json2({ operator: serializeOperator2(row) });
  }
  if (operatorMatch && request.method === "PATCH") {
    if (!canAccessOperators(session)) {
      return json2({ error: "Acesso restrito a t\xE9cnicos" }, 403);
    }
    const operatorId = Number(operatorMatch[1]);
    const existing = await queryFirst(env, "SELECT id FROM operators WHERE id = ?", [operatorId]);
    if (!existing) return json2({ error: "T\xE9cnico n\xE3o encontrado" }, 404);
    const body = await readJson(request);
    let operatorData;
    try {
      operatorData = normalizeOperatorPayload(body, { requirePhoto: true });
    } catch (error) {
      return json2({ error: error.message }, error.statusCode || 400);
    }
    try {
      await execute(
        env,
        `UPDATE operators
                 SET full_name = ?,
                     mother_name = ?,
                     cpf = ?,
                     rg = ?,
                     birth_date = ?,
                     address = ?,
                     email = ?,
                     phone = ?,
                     area = ?,
                     has_vehicle = ?,
                     pix = ?,
                     agency = ?,
                     photo = ?,
                     cache_value = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
        [
          operatorData.fullName,
          operatorData.motherName,
          operatorData.cpf,
          operatorData.rg,
          operatorData.birthDate,
          operatorData.address,
          operatorData.email,
          operatorData.phone,
          operatorData.area,
          operatorData.hasVehicle ? 1 : 0,
          operatorData.pix,
          operatorData.agency,
          operatorData.photo,
          operatorData.cacheValue,
          operatorId
        ]
      );
      return json2({ success: true, id: operatorId });
    } catch (error) {
      return handleDatabaseError(error, "J\xE1 existe um t\xE9cnico com esse CPF");
    }
  }
  if (operatorMatch && request.method === "DELETE") {
    if (!canAccessOperators(session)) {
      return json2({ error: "Acesso restrito a t\xE9cnicos" }, 403);
    }
    const operatorId = Number(operatorMatch[1]);
    const existing = await queryFirst(env, "SELECT id FROM operators WHERE id = ?", [operatorId]);
    if (!existing) return json2({ error: "T\xE9cnico n\xE3o encontrado" }, 404);
    await execute(env, "DELETE FROM operators WHERE id = ?", [operatorId]);
    return json2({ success: true, id: operatorId });
  }
  if (pathname === "/api/events" && request.method === "GET") {
    await ensureAutomaticScheduledEvents(env, {
      queryAll,
      queryFirst,
      execute,
      batch: executeBatch,
      tableExists,
      tableHasColumn,
      ensureColumn
    });
    const rows = await getEventsByCompletion(env, "event", false);
    return json2(rows);
  }
  if (pathname === "/api/events" && request.method === "POST") {
    const body = await readJson(request);
    const name = String(body.name || "").trim();
    const date = parseIsoDateKey2(body.date);
    const endDate = parseIsoDateKey2(body.endDate || body.end_date || body.date);
    if (!name || !date || !endDate) {
      return json2({ error: "Nome, data inicial e data final s\xE3o obrigat\xF3rios" }, 400);
    }
    if (endDate < date) {
      return json2({ error: "A data final n\xE3o pode ser anterior \xE0 data inicial" }, 400);
    }
    const result = await execute(
      env,
      "INSERT INTO events (name, date, end_date, created_by_username, event_type) VALUES (?, ?, ?, ?, 'event')",
      [name, date, endDate, session?.username || null]
    );
    return json2({ id: result.meta.last_row_id, success: true });
  }
  if (pathname === "/api/rental-events" && request.method === "GET") {
    const rows = await getEventsByCompletion(env, "rental", false);
    return json2(rows);
  }
  if (pathname === "/api/history-events" && request.method === "GET") {
    await ensureAutomaticScheduledEvents(env, {
      queryAll,
      queryFirst,
      execute,
      batch: executeBatch,
      tableExists,
      tableHasColumn,
      ensureColumn
    });
    const [events, rentals] = await Promise.all([
      getEventsByCompletion(env, "event", true),
      getEventsByCompletion(env, "rental", true)
    ]);
    return json2({ events, rentals });
  }
  if (pathname === "/api/rental-return-alerts" && request.method === "GET") {
    const today = String(url.searchParams.get("today") || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
      return json2({ error: "Data inv\xE1lida" }, 400);
    }
    const alerts = await getRentalReturnAlerts(env, today);
    return json2(alerts);
  }
  if (pathname === "/api/rental-events" && request.method === "POST") {
    const body = await readJson(request);
    const name = String(body.name || "").trim();
    const withdrawalDate = String(body.withdrawalDate || "").trim();
    const returnDate = String(body.returnDate || "").trim();
    const session2 = await getSessionFromRequest(request, env);
    if (!name || !withdrawalDate || !returnDate) {
      return json2({ error: "Nome, data de retirada e data de devolu\xE7\xE3o s\xE3o obrigat\xF3rios" }, 400);
    }
    if (returnDate < withdrawalDate) {
      return json2({ error: "A data de devolu\xE7\xE3o n\xE3o pode ser anterior \xE0 data de retirada" }, 400);
    }
    const result = await execute(
      env,
      `INSERT INTO events (name, date, created_by_username, event_type, withdrawal_date, return_date)
             VALUES (?, ?, ?, 'rental', ?, ?)`,
      [name, withdrawalDate, session2?.username || null, withdrawalDate, returnDate]
    );
    return json2({ id: result.meta.last_row_id, success: true });
  }
  const rentalEventMatch = pathname.match(/^\/api\/rental-events\/(\d+)$/);
  if (rentalEventMatch && request.method === "GET") {
    const event = await queryFirst(
      env,
      "SELECT * FROM events WHERE id = ? AND COALESCE(event_type, 'event') = 'rental'",
      [Number(rentalEventMatch[1])]
    );
    if (!event) return json2({ error: "Loca\xE7\xE3o n\xE3o encontrada" }, 404);
    return json2(event);
  }
  if (rentalEventMatch && request.method === "DELETE") {
    const body = await readJson(request);
    const password = String(body.password || "").trim();
    if (!await verifyDeletePassword(password, env)) {
      return json2({ message: "Senha incorreta" }, 403);
    }
    const eventId = Number(rentalEventMatch[1]);
    const event = await queryFirst(
      env,
      "SELECT id FROM events WHERE id = ? AND COALESCE(event_type, 'event') = 'rental'",
      [eventId]
    );
    if (!event) return json2({ error: "Loca\xE7\xE3o n\xE3o encontrada" }, 404);
    await deleteEventRecords(env, eventId);
    return json2({ success: true });
  }
  const eventMatch = pathname.match(/^\/api\/events\/(\d+)$/);
  if (eventMatch && request.method === "GET") {
    const event = await queryFirst(env, "SELECT * FROM events WHERE id = ?", [Number(eventMatch[1])]);
    if (!event) return json2({ error: "Evento n\xE3o encontrado" }, 404);
    return json2(event);
  }
  const reservedEquipmentsMatch = pathname.match(/^\/api\/events\/(\d+)\/reserved-equipments$/);
  if (reservedEquipmentsMatch && request.method === "GET") {
    const eventId = Number(reservedEquipmentsMatch[1]);
    const event = await queryFirst(env, "SELECT id FROM events WHERE id = ?", [eventId]);
    if (!event) return json2({ error: "Evento n\xE3o encontrado" }, 404);
    const rows = await queryAll(
      env,
      `SELECT equipments.id,
                    equipments.name,
                    equipments.barcode,
                    COALESCE(equipments.category, 'Outros') AS category
             FROM event_reserved_equipments reserved
             INNER JOIN equipments ON equipments.id = reserved.equipment_id
             WHERE reserved.event_id = ?
             ORDER BY lower(equipments.name) ASC, equipments.barcode ASC`,
      [eventId]
    );
    return json2(rows);
  }
  const equipmentRequirementsMatch = pathname.match(/^\/api\/events\/(\d+)\/equipment-requirements$/);
  if (equipmentRequirementsMatch && request.method === "GET") {
    const eventId = Number(equipmentRequirementsMatch[1]);
    const event = await queryFirst(env, "SELECT id FROM events WHERE id = ?", [eventId]);
    if (!event) return json2({ error: "Evento n\xE3o encontrado" }, 404);
    const requirements = await getEventEquipmentRequirements(env, eventId, {
      queryAll,
      queryFirst,
      execute,
      batch: executeBatch,
      tableExists,
      tableHasColumn,
      ensureColumn
    });
    return json2({ requirements });
  }
  const eventSpacesMatch = pathname.match(/^\/api\/events\/(\d+)\/spaces$/);
  if (eventSpacesMatch && request.method === "GET") {
    const eventId = Number(eventSpacesMatch[1]);
    const event = await queryFirst(env, "SELECT id FROM events WHERE id = ?", [eventId]);
    if (!event) return json2({ error: "Evento n\xE3o encontrado" }, 404);
    const spaces = await queryAll(
      env,
      `SELECT id, event_id, name, created_at
             FROM event_spaces
             WHERE event_id = ?
             ORDER BY datetime(created_at) ASC, id ASC`,
      [eventId]
    );
    return json2(spaces);
  }
  if (eventSpacesMatch && request.method === "POST") {
    const eventId = Number(eventSpacesMatch[1]);
    const body = await readJson(request);
    const name = String(body.name || "").trim();
    if (!name) return json2({ error: "Nome do espa\xE7o \xE9 obrigat\xF3rio" }, 400);
    if (name.length > 80) return json2({ error: "Nome do espa\xE7o deve ter at\xE9 80 caracteres" }, 400);
    const event = await queryFirst(env, "SELECT id FROM events WHERE id = ?", [eventId]);
    if (!event) return json2({ error: "Evento n\xE3o encontrado" }, 404);
    const result = await execute(
      env,
      `INSERT INTO event_spaces (event_id, name)
             SELECT ?, ?
             WHERE EXISTS (SELECT 1 FROM events WHERE id = ?)`,
      [eventId, name, eventId]
    );
    if (Number(result?.meta?.changes) !== 1) {
      return json2({ error: "O evento foi exclu\xEDdo durante a opera\xE7\xE3o. Atualize a tela." }, 409);
    }
    return json2({
      id: result.meta.last_row_id,
      event_id: eventId,
      name
    });
  }
  const historyMatch = pathname.match(/^\/api\/events\/(\d+)\/history$/);
  if (historyMatch && request.method === "GET") {
    const rows = await queryAll(
      env,
      `SELECT
                ee.id,
                ee.equipment_id,
                ee.event_id,
                ee.space_id,
                es.name AS space_name,
                ee.action_type,
                ee.performed_by_username,
                ee.created_at,
                e.name AS equipment_name,
                e.barcode
             FROM equipment_events ee
             INNER JOIN equipments e ON e.id = ee.equipment_id
             LEFT JOIN event_spaces es ON es.id = ee.space_id
             WHERE ee.event_id = ?
               AND NOT EXISTS (
                    SELECT 1
                    FROM event_saida_hidden_items hidden
                    WHERE hidden.event_id = ee.event_id
                      AND hidden.item_type = 'equipment'
                      AND hidden.item_id = ee.equipment_id
                      AND COALESCE(hidden.space_id, 0) = COALESCE(ee.space_id, 0)
               )
             ORDER BY datetime(ee.created_at) ASC, ee.id ASC`,
      [Number(historyMatch[1])]
    );
    return json2(rows);
  }
  const cableHistoryMatch = pathname.match(/^\/api\/events\/(\d+)\/cable-history$/);
  if (cableHistoryMatch && request.method === "GET") {
    const rows = await queryAll(
      env,
      `SELECT
                cem.cable_id,
                cem.space_id,
                es.name AS space_name,
                c.name,
                SUM(cem.quantity) AS quantity
             FROM cable_event_movements cem
             INNER JOIN cables c ON c.id = cem.cable_id
             LEFT JOIN event_spaces es ON es.id = cem.space_id
             WHERE cem.event_id = ?
               AND cem.action_type = 'saida'
               AND NOT EXISTS (
                    SELECT 1
                    FROM event_saida_hidden_items hidden
                    WHERE hidden.event_id = cem.event_id
                      AND hidden.item_type = 'cable'
                      AND hidden.item_id = cem.cable_id
                      AND COALESCE(hidden.space_id, 0) = COALESCE(cem.space_id, 0)
               )
             GROUP BY cem.cable_id, cem.space_id, es.name, c.name
             ORDER BY COALESCE(es.id, 0) ASC, lower(c.name) ASC, cem.cable_id ASC`,
      [Number(cableHistoryMatch[1])]
    );
    return json2(rows);
  }
  const cableSummaryMatch = pathname.match(/^\/api\/events\/(\d+)\/cable-summary$/);
  if (cableSummaryMatch && request.method === "GET") {
    const rows = await queryAll(
      env,
      `SELECT
                cem.cable_id,
                cem.space_id,
                es.name AS space_name,
                c.name,
                SUM(CASE WHEN cem.action_type = 'saida' THEN cem.quantity ELSE 0 END) AS saida,
                SUM(CASE WHEN cem.action_type = 'entrada' THEN cem.quantity ELSE 0 END) AS entrada,
                SUM(CASE WHEN cem.action_type = 'saida' THEN cem.quantity ELSE -cem.quantity END) AS final
             FROM cable_event_movements cem
             INNER JOIN cables c ON c.id = cem.cable_id
             LEFT JOIN event_spaces es ON es.id = cem.space_id
             WHERE cem.event_id = ?
               AND NOT EXISTS (
                    SELECT 1
                    FROM event_saida_hidden_items hidden
                    WHERE hidden.event_id = cem.event_id
                      AND hidden.item_type = 'cable'
                      AND hidden.item_id = cem.cable_id
                      AND COALESCE(hidden.space_id, 0) = COALESCE(cem.space_id, 0)
               )
             GROUP BY cem.cable_id, cem.space_id, es.name, c.name
             ORDER BY COALESCE(es.id, 0) ASC, lower(c.name) ASC, cem.cable_id ASC`,
      [Number(cableSummaryMatch[1])]
    );
    return json2(rows);
  }
  const otherItemSummaryMatch = pathname.match(/^\/api\/events\/(\d+)\/other-item-summary$/);
  if (otherItemSummaryMatch && request.method === "GET") {
    const rows = await queryAll(
      env,
      `SELECT
                oiem.item_id,
                oiem.space_id,
                es.name AS space_name,
                oi.name,
                SUM(CASE WHEN oiem.action_type = 'saida' THEN oiem.quantity ELSE 0 END) AS saida,
                SUM(CASE WHEN oiem.action_type = 'entrada' THEN oiem.quantity ELSE 0 END) AS entrada,
                SUM(CASE WHEN oiem.action_type = 'saida' THEN oiem.quantity ELSE -oiem.quantity END) AS final
             FROM other_item_event_movements oiem
             INNER JOIN other_items oi ON oi.id = oiem.item_id
             LEFT JOIN event_spaces es ON es.id = oiem.space_id
             WHERE oiem.event_id = ?
               AND NOT EXISTS (
                    SELECT 1
                    FROM event_saida_hidden_items hidden
                    WHERE hidden.event_id = oiem.event_id
                      AND hidden.item_type = 'other'
                      AND hidden.item_id = oiem.item_id
                      AND COALESCE(hidden.space_id, 0) = COALESCE(oiem.space_id, 0)
               )
             GROUP BY oiem.item_id, oiem.space_id, es.name, oi.name
             ORDER BY COALESCE(es.id, 0) ASC, lower(oi.name) ASC, oiem.item_id ASC`,
      [Number(otherItemSummaryMatch[1])]
    );
    return json2(rows);
  }
  const quoteOtherItemSummaryMatch = pathname.match(/^\/api\/events\/(\d+)\/quote-other-item-summary$/);
  if (quoteOtherItemSummaryMatch && request.method === "GET") {
    const eventId = Number(quoteOtherItemSummaryMatch[1]);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return json2({ error: "Evento inv\xE1lido" }, 400);
    }
    const rows = await queryAll(
      env,
      `SELECT quote_items.id AS quote_item_id,
                    movements.space_id,
                    event_spaces.name AS space_name,
                    quote_items.description AS name,
                    quote_items.quantity AS requested_quantity,
                    COALESCE(SUM(CASE WHEN movements.action_type = 'saida' THEN movements.quantity ELSE 0 END), 0) AS saida,
                    COALESCE(SUM(CASE WHEN movements.action_type = 'entrada' THEN movements.quantity ELSE 0 END), 0) AS entrada,
                    COALESCE(SUM(CASE
                        WHEN movements.action_type = 'saida' THEN movements.quantity
                        WHEN movements.action_type = 'entrada' THEN -movements.quantity
                        ELSE 0
                    END), 0) AS final
             FROM events
             INNER JOIN quote_items ON quote_items.quote_id = events.orcamento_id
             LEFT JOIN quote_manual_item_movements movements
               ON movements.event_id = events.id
              AND movements.quote_item_id = quote_items.id
             LEFT JOIN event_spaces ON event_spaces.id = movements.space_id
             WHERE events.id = ?
               AND COALESCE(quote_items.is_manual, 0) = 1
             GROUP BY quote_items.id,
                      movements.space_id,
                      event_spaces.name,
                      quote_items.description,
                      quote_items.quantity
             ORDER BY COALESCE(event_spaces.id, 0) ASC,
                      lower(quote_items.description) ASC,
                      quote_items.id ASC`,
      [eventId]
    );
    return json2(rows);
  }
  const hideSaidaItemMatch = pathname.match(/^\/api\/events\/(\d+)\/saida-hidden-items$/);
  if (hideSaidaItemMatch && request.method === "POST") {
    const eventId = Number(hideSaidaItemMatch[1]);
    const body = await readJson(request);
    const itemType = String(body.itemType || "").trim();
    const itemId = Number(body.itemId);
    const password = String(body.password || "").trim();
    if (!await verifyDeletePassword(password, env)) {
      return json2({ message: "Senha incorreta" }, 403);
    }
    if (!eventId || !["equipment", "cable", "other"].includes(itemType) || !itemId) {
      return json2({ message: "Dados inv\xE1lidos para excluir da sa\xEDda" }, 400);
    }
    const spaceId = await resolveEventSpaceId2(env, eventId, body.spaceId);
    await execute(
      env,
      `INSERT OR IGNORE INTO event_saida_hidden_items (event_id, item_type, item_id, space_id)
             VALUES (?, ?, ?, ?)`,
      [eventId, itemType, itemId, spaceId]
    );
    return json2({ success: true });
  }
  if (eventMatch && request.method === "DELETE") {
    const eventId = Number(eventMatch[1]);
    await deleteEventRecords(env, eventId);
    return json2({ success: true });
  }
  if (pathname === "/api/equipments" && request.method === "GET") {
    const search = String(url.searchParams.get("search") || "").trim();
    const rows = await queryAll(
      env,
      `SELECT equipments.*,
                    (
                        SELECT events.name
                        FROM equipment_events AS outgoing
                        INNER JOIN events ON events.id = outgoing.event_id
                        WHERE outgoing.equipment_id = equipments.id
                          AND outgoing.action_type = 'saida'
                          AND NOT EXISTS (
                              SELECT 1
                              FROM equipment_events AS incoming
                              WHERE incoming.equipment_id = outgoing.equipment_id
                                AND incoming.event_id = outgoing.event_id
                                AND incoming.action_type = 'entrada'
                                AND (
                                    datetime(incoming.created_at) > datetime(outgoing.created_at)
                                    OR (
                                        datetime(incoming.created_at) = datetime(outgoing.created_at)
                                        AND incoming.id > outgoing.id
                                    )
                                )
                          )
                        ORDER BY datetime(outgoing.created_at) DESC, outgoing.id DESC
                        LIMIT 1
                    ) AS current_event_name,
                    (
                        SELECT maintenances.description
                        FROM maintenances
                        WHERE maintenances.equipment_id = equipments.id
                          AND maintenances.resolved_at IS NULL
                        ORDER BY datetime(maintenances.created_at) DESC, maintenances.id DESC
                        LIMIT 1
                    ) AS maintenance_description
             FROM equipments
             WHERE equipments.name LIKE ?
                OR equipments.barcode LIKE ?
                OR COALESCE(equipments.observation, '') LIKE ?
                OR equipments.category LIKE ?
             ORDER BY equipments.category ASC, equipments.name ASC`,
      [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
    );
    return json2(rows);
  }
  if (pathname === "/api/equipments" && request.method === "POST") {
    const body = await readJson(request);
    const name = String(body.name || "").trim();
    const barcode = normalizeEquipmentBarcode(body.barcode);
    const category = String(body.category || "Outros").trim() || "Outros";
    const serialNumber = String(body.serialNumber || body.serial_number || "").trim() || "-";
    const observation = String(body.observation || "").trim() || "-";
    if (!name || !barcode) {
      return json2({ error: "Nome e c\xF3digo de barras s\xE3o obrigat\xF3rios" }, 400);
    }
    try {
      const existingEquipment = await queryFirst(
        env,
        "SELECT id, name, barcode FROM equipments WHERE barcode = ?",
        [barcode]
      );
      if (existingEquipment) {
        return json2({
          error: duplicateEquipmentMessage(existingEquipment),
          equipment: existingEquipment
        }, 409);
      }
      const result = await execute(
        env,
        "INSERT INTO equipments (name, barcode, current_status, category, serial_number, observation) VALUES (?, ?, ?, ?, ?, ?)",
        [name, barcode, "Disponivel", category, serialNumber, observation]
      );
      return json2({ id: result.meta.last_row_id, success: true });
    } catch (error) {
      return handleDatabaseError(error, "J\xE1 existe um equipamento com esse c\xF3digo de barras");
    }
  }
  const equipmentStatusMatch = pathname.match(/^\/api\/equipments\/(\d+)\/status$/);
  if (equipmentStatusMatch && request.method === "PATCH") {
    const equipmentId = Number(equipmentStatusMatch[1]);
    const body = await readJson(request);
    const status = String(body.status || "").trim();
    if (!equipmentId || !status) {
      return json2({ message: "ID e status s\xE3o obrigat\xF3rios" }, 400);
    }
    const equipment = await queryFirst(env, "SELECT * FROM equipments WHERE id = ?", [equipmentId]);
    if (!equipment) return json2({ message: "Equipamento n\xE3o encontrado" }, 404);
    await execute(env, "UPDATE equipments SET current_status = ? WHERE id = ?", [status, equipmentId]);
    return json2({ success: true });
  }
  if (pathname === "/api/cables" && request.method === "GET") {
    const search = String(url.searchParams.get("search") || "").trim();
    const rows = await queryAll(
      env,
      `SELECT
                cables.*,
                (
                    SELECT cm.description
                    FROM cable_maintenances cm
                    WHERE cm.cable_id = cables.id
                      AND cm.resolved_at IS NULL
                    ORDER BY datetime(cm.created_at) DESC, cm.id DESC
                    LIMIT 1
                ) AS maintenance_description
             FROM cables
             WHERE name LIKE ? OR category LIKE ?
             ORDER BY category ASC, name ASC`,
      [`%${search}%`, `%${search}%`]
    );
    return json2(rows);
  }
  if (pathname === "/api/cables" && request.method === "POST") {
    const body = await readJson(request);
    const name = String(body.name || "").trim();
    const quantity = Number(body.quantity);
    const category = String(body.category || "Outros").trim() || "Outros";
    if (!name) return json2({ error: "Nome do cabo \xE9 obrigat\xF3rio" }, 400);
    if (!Number.isInteger(quantity) || quantity < 0) {
      return json2({ error: "Quantidade inv\xE1lida" }, 400);
    }
    try {
      const result = await execute(
        env,
        `INSERT INTO cables (name, quantity, available_quantity, category, updated_at)
                 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [name, quantity, quantity, category]
      );
      return json2({ id: result.meta.last_row_id, success: true });
    } catch (error) {
      return handleDatabaseError(error, "J\xE1 existe um cabo com esse nome");
    }
  }
  const cableMatch = pathname.match(/^\/api\/cables\/(\d+)$/);
  if (cableMatch && request.method === "PATCH") {
    const cableId = Number(cableMatch[1]);
    const body = await readJson(request);
    const quantity = Number(body.quantity);
    const password = String(body.password || "").trim();
    if (!cableId) return json2({ message: "ID do cabo \xE9 obrigat\xF3rio" }, 400);
    if (!Number.isInteger(quantity) || quantity < 0) {
      return json2({ message: "Quantidade inv\xE1lida" }, 400);
    }
    if (!canEditInitialQuantity(session, password)) {
      return json2({ message: "Apenas Arthur pode editar com a senha correta" }, 403);
    }
    const cable = await queryFirst(env, "SELECT * FROM cables WHERE id = ?", [cableId]);
    if (!cable) return json2({ message: "Cabo n\xE3o encontrado" }, 404);
    const currentQuantity = Number(cable.quantity) || 0;
    const result = await execute(
      env,
      `UPDATE cables
             SET available_quantity = available_quantity + (? - quantity),
                 quantity = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?
               AND quantity = ?
               AND available_quantity + (? - quantity) >= 0`,
      [quantity, quantity, cableId, currentQuantity, quantity]
    );
    if (Number(result?.meta?.changes) === 0) {
      return json2({ message: "O estoque foi alterado por outra opera\xE7\xE3o. Atualize a tela e tente novamente." }, 409);
    }
    return json2({ success: true });
  }
  if (cableMatch && request.method === "DELETE") {
    const cableId = Number(cableMatch[1]);
    const body = await readJson(request);
    const password = String(body.password || "").trim();
    if (!cableId) return json2({ message: "ID do cabo \xE9 obrigat\xF3rio" }, 400);
    if (!await verifyDeletePassword(password, env)) return json2({ message: "Senha incorreta" }, 403);
    const cable = await queryFirst(env, "SELECT * FROM cables WHERE id = ?", [cableId]);
    if (!cable) return json2({ message: "Cabo n\xE3o encontrado" }, 404);
    await executeIdempotentBatch(env, [
      { sql: "DELETE FROM cable_event_movements WHERE cable_id = ?", params: [cableId] },
      { sql: "DELETE FROM cable_maintenances WHERE cable_id = ?", params: [cableId] },
      { sql: "DELETE FROM event_saida_hidden_items WHERE item_type = 'cable' AND item_id = ?", params: [cableId] },
      { sql: "DELETE FROM cables WHERE id = ?", params: [cableId] }
    ], "delete-cable");
    return json2({ success: true });
  }
  if (pathname === "/api/other-items" && request.method === "GET") {
    const search = String(url.searchParams.get("search") || "").trim();
    const rows = await queryAll(
      env,
      `SELECT id,
                    name,
                    quantity,
                    available_quantity,
                    COALESCE(category, 'Outros') AS category,
                    created_at,
                    updated_at
             FROM other_items
             WHERE name LIKE ?
             ORDER BY category ASC, name ASC`,
      [`%${search}%`]
    );
    return json2(rows);
  }
  if (pathname === "/api/other-items" && request.method === "POST") {
    const body = await readJson(request);
    const name = String(body.name || "").trim().toLocaleUpperCase("pt-BR");
    const quantity = Number(body.quantity);
    const category = String(body.category || "Outros").trim() || "Outros";
    if (!name) return json2({ error: "Nome do item \xE9 obrigat\xF3rio" }, 400);
    if (!Number.isInteger(quantity) || quantity < 0) {
      return json2({ error: "Quantidade inv\xE1lida" }, 400);
    }
    try {
      const hasCategory = await tableHasColumn(env, "other_items", "category");
      const result = await execute(
        env,
        hasCategory ? `INSERT INTO other_items (name, quantity, available_quantity, category, updated_at)
                       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)` : `INSERT INTO other_items (name, quantity, available_quantity, updated_at)
                       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        hasCategory ? [name, quantity, quantity, category] : [name, quantity, quantity]
      );
      return json2({ id: result.meta.last_row_id, success: true });
    } catch (error) {
      return handleDatabaseError(error, "J\xE1 existe um item com esse nome");
    }
  }
  const otherItemMatch = pathname.match(/^\/api\/other-items\/(\d+)$/);
  if (otherItemMatch && request.method === "PATCH") {
    const itemId = Number(otherItemMatch[1]);
    const body = await readJson(request);
    const quantity = Number(body.quantity);
    const password = String(body.password || "").trim();
    if (!itemId) return json2({ message: "ID do item \xE9 obrigat\xF3rio" }, 400);
    if (!Number.isInteger(quantity) || quantity < 0) {
      return json2({ message: "Quantidade inv\xE1lida" }, 400);
    }
    if (!canEditInitialQuantity(session, password)) {
      return json2({ message: "Apenas Arthur pode editar com a senha correta" }, 403);
    }
    const item = await queryFirst(env, "SELECT * FROM other_items WHERE id = ?", [itemId]);
    if (!item) return json2({ message: "Item n\xE3o encontrado" }, 404);
    const currentQuantity = Number(item.quantity) || 0;
    const result = await execute(
      env,
      `UPDATE other_items
             SET available_quantity = available_quantity + (? - quantity),
                 quantity = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?
               AND quantity = ?
               AND available_quantity + (? - quantity) >= 0`,
      [quantity, quantity, itemId, currentQuantity, quantity]
    );
    if (Number(result?.meta?.changes) === 0) {
      return json2({ message: "O estoque foi alterado por outra opera\xE7\xE3o. Atualize a tela e tente novamente." }, 409);
    }
    return json2({ success: true });
  }
  if (otherItemMatch && request.method === "DELETE") {
    const itemId = Number(otherItemMatch[1]);
    const body = await readJson(request);
    const password = String(body.password || "").trim();
    if (!itemId) return json2({ message: "ID do item \xE9 obrigat\xF3rio" }, 400);
    if (!await verifyDeletePassword(password, env)) return json2({ message: "Senha incorreta" }, 403);
    const item = await queryFirst(env, "SELECT * FROM other_items WHERE id = ?", [itemId]);
    if (!item) return json2({ message: "Item n\xE3o encontrado" }, 404);
    await executeIdempotentBatch(env, [
      { sql: "DELETE FROM other_item_event_movements WHERE item_id = ?", params: [itemId] },
      { sql: "DELETE FROM event_saida_hidden_items WHERE item_type = 'other' AND item_id = ?", params: [itemId] },
      { sql: "DELETE FROM other_items WHERE id = ?", params: [itemId] }
    ], "delete-other-item");
    return json2({ success: true });
  }
  const equipmentMatch = pathname.match(/^\/api\/equipments\/(\d+)$/);
  if (equipmentMatch && request.method === "PATCH") {
    const equipmentId = Number(equipmentMatch[1]);
    const body = await readJson(request);
    const name = String(body.name || "").trim();
    const barcode = normalizeEquipmentBarcode(body.barcode);
    const serialNumber = String(body.serialNumber || body.serial_number || "").trim() || "-";
    const observation = String(body.observation || "").trim() || "-";
    if (!equipmentId) return json2({ message: "ID do equipamento e obrigatorio" }, 400);
    if (!name || !barcode) {
      return json2({ error: "Nome e patrimonio/codigo de barras sao obrigatorios." }, 400);
    }
    const equipment = await queryFirst(env, "SELECT * FROM equipments WHERE id = ?", [equipmentId]);
    if (!equipment) return json2({ message: "Equipamento nao encontrado" }, 404);
    const existingEquipment = await queryFirst(
      env,
      "SELECT id, name, barcode FROM equipments WHERE barcode = ? AND id <> ?",
      [barcode, equipmentId]
    );
    if (existingEquipment) {
      return json2({
        error: duplicateEquipmentMessage(existingEquipment),
        equipment: existingEquipment
      }, 409);
    }
    try {
      await executeBatch(env, [
        {
          sql: `UPDATE equipments
                          SET name = ?, barcode = ?, serial_number = ?, observation = ?
                          WHERE id = ?`,
          params: [name, barcode, serialNumber, observation, equipmentId]
        },
        {
          sql: `UPDATE equipments
                          SET unit_price = (
                              SELECT MAX(COALESCE(source.unit_price, 1))
                              FROM equipments AS source
                              WHERE lower(trim(source.name)) = lower(trim(?))
                          )
                          WHERE lower(trim(name)) = lower(trim(?))`,
          params: [name, name]
        }
      ]);
      const groupPrice = await queryFirst(
        env,
        `SELECT MAX(COALESCE(unit_price, 1)) AS unitPrice
                 FROM equipments
                 WHERE lower(trim(name)) = lower(trim(?))`,
        [name]
      );
      const unitPrice = roundMoney2(parseMoneyValue2(groupPrice?.unitPrice));
      return json2({
        success: true,
        equipment: {
          ...equipment,
          name,
          barcode,
          serial_number: serialNumber,
          serialNumber,
          observation,
          unit_price: unitPrice,
          unitPrice
        }
      });
    } catch (error) {
      return handleDatabaseError(error, duplicateEquipmentMessage());
    }
  }
  if (equipmentMatch && request.method === "DELETE") {
    const equipmentId = Number(equipmentMatch[1]);
    const body = await readJson(request);
    const password = String(body.password || "").trim();
    if (!equipmentId) return json2({ message: "ID do equipamento \xE9 obrigat\xF3rio" }, 400);
    if (!await verifyDeletePassword(password, env)) return json2({ message: "Senha incorreta" }, 403);
    const equipment = await queryFirst(env, "SELECT * FROM equipments WHERE id = ?", [equipmentId]);
    if (!equipment) return json2({ message: "Equipamento n\xE3o encontrado" }, 404);
    await executeIdempotentBatch(env, [
      { sql: "DELETE FROM equipment_events WHERE equipment_id = ?", params: [equipmentId] },
      { sql: "DELETE FROM event_reserved_equipments WHERE equipment_id = ?", params: [equipmentId] },
      { sql: "DELETE FROM maintenances WHERE equipment_id = ?", params: [equipmentId] },
      { sql: "DELETE FROM event_saida_hidden_items WHERE item_type = 'equipment' AND item_id = ?", params: [equipmentId] },
      { sql: "DELETE FROM quote_hidden_equipments WHERE equipment_id = ?", params: [equipmentId] },
      { sql: "DELETE FROM equipments WHERE id = ?", params: [equipmentId] }
    ], "delete-equipment");
    return json2({ success: true });
  }
  const movementMatch = pathname.match(/^\/api\/equipment-events\/(saida|entrada)$/);
  if (movementMatch && request.method === "POST") {
    const type = movementMatch[1];
    const body = await readJson(request);
    const equipmentId = Number(body.equipmentId);
    const barcode = String(body.barcode || "").trim();
    const eventId = Number(body.eventId);
    const performedByUsername = session?.username || null;
    if (!equipmentId && !barcode || !eventId) {
      return json2({ message: "equipmentId ou c\xF3digo de barras e eventId s\xE3o obrigat\xF3rios" }, 400);
    }
    const mutationRequestId = getMutationRequestId(request, body);
    const [equipmentResult, eventResult] = await executeBatch(env, [
      equipmentId ? { sql: "SELECT * FROM equipments WHERE id = ?", params: [equipmentId] } : { sql: "SELECT * FROM equipments WHERE barcode = ?", params: [barcode] },
      { sql: "SELECT * FROM events WHERE id = ?", params: [eventId] }
    ]);
    const equipment = equipmentResult?.results?.[0] || null;
    const event = eventResult?.results?.[0] || null;
    const resolvedEquipmentId = Number(equipment?.id);
    if (!equipment) return json2({ message: "Equipamento n\xE3o encontrado" }, 404);
    if (!event) return json2({ message: "Evento n\xE3o encontrado" }, 404);
    const spaceId = await resolveEventSpaceId2(env, eventId, body.spaceId);
    const existingMovementRequest = await queryFirst(
      env,
      `SELECT id FROM equipment_events
             WHERE request_id = ?
               AND equipment_id = ?
               AND event_id = ?
               AND COALESCE(space_id, 0) = COALESCE(?, 0)
               AND action_type = ?`,
      [mutationRequestId, resolvedEquipmentId, eventId, spaceId, type]
    );
    if (existingMovementRequest) {
      return json2({ success: true, equipment, requestId: mutationRequestId, replayed: true });
    }
    if (type === "saida") {
      if (isMaintenanceStatus(equipment.current_status)) {
        return json2({ message: "Equipamento em manuten\xE7\xE3o" }, 409);
      }
      const sameEventMovement = await queryFirst(
        env,
        `SELECT action_type
                 FROM equipment_events
                 WHERE equipment_id = ? AND event_id = ?
                   AND ${spacePredicate("space_id")}
                 ORDER BY datetime(created_at) DESC, id DESC
                 LIMIT 1`,
        [resolvedEquipmentId, eventId, spaceId]
      );
      if (sameEventMovement?.action_type === "saida") {
        return json2({ message: "Este equipamento j\xE1 possui sa\xEDda pendente neste evento" }, 409);
      }
      const eventRange = getEventDateRange2(event);
      if (!eventRange) {
        return json2({ message: "Evento sem per\xEDodo v\xE1lido" }, 400);
      }
      const dateConflict = await findEquipmentDateConflict(
        env,
        resolvedEquipmentId,
        eventRange,
        {
          equipment: {
            id: equipment.id,
            name: equipment.name,
            barcode: equipment.barcode,
            currentStatus: equipment.current_status,
            category: equipment.category,
            unitPrice: equipment.unit_price
          },
          excludeQuoteId: Number(event.orcamento_id) || null,
          excludeEventId: eventId
        },
        {
          queryAll,
          queryFirst,
          execute,
          batch: executeBatch,
          tableExists,
          tableHasColumn,
          ensureColumn
        }
      );
      if (dateConflict) {
        return json2({
          code: "DATE_CONFLICT",
          error: "Patrim\xF4nio indispon\xEDvel por conflito de datas.",
          conflict: dateConflict
        }, 409);
      }
      const capacityConflict = await findEquipmentGroupCapacityConflict(
        env,
        { id: equipment.id, name: equipment.name },
        event,
        {
          queryAll,
          queryFirst,
          execute,
          batch: executeBatch,
          tableExists,
          tableHasColumn,
          ensureColumn
        }
      );
      if (capacityConflict) {
        return json2({
          code: "QUOTE_CAPACITY_PROTECTED",
          message: `Sa\xEDda n\xE3o registrada. Existem unidades de "${equipment.name}" reservadas para or\xE7amentos neste per\xEDodo. Dispon\xEDvel para este evento: ${capacityConflict.availableQuantity}.`,
          error: "Quantidade protegida por or\xE7amento no mesmo per\xEDodo.",
          conflict: capacityConflict
        }, 409);
      }
      await executeIdempotentMutationBatch(env, {
        operation: "equipment-checkout",
        operations: [
          {
            sql: `INSERT INTO equipment_events
                              (equipment_id, event_id, space_id, action_type, performed_by_username, request_id)
                              VALUES (?, ?, ?, 'saida', ?, ?)`,
            params: [resolvedEquipmentId, eventId, spaceId, performedByUsername, mutationRequestId]
          },
          {
            sql: `INSERT OR IGNORE INTO event_reserved_equipments (event_id, equipment_id)
                              VALUES (?, ?)`,
            params: [eventId, resolvedEquipmentId]
          }
        ],
        verificationSql: `SELECT id FROM equipment_events
                                  WHERE request_id = ?
                                    AND equipment_id = ?
                                    AND event_id = ?
                                    AND COALESCE(space_id, 0) = COALESCE(?, 0)
                                    AND action_type = 'saida'`,
        verificationParams: [mutationRequestId, resolvedEquipmentId, eventId, spaceId]
      });
      return json2({ success: true, equipment, requestId: mutationRequestId });
    }
    const lastMovement = await queryFirst(
      env,
      `SELECT action_type
             FROM equipment_events
             WHERE equipment_id = ? AND event_id = ?
               AND ${spacePredicate("space_id")}
             ORDER BY datetime(created_at) DESC, id DESC
             LIMIT 1`,
      [resolvedEquipmentId, eventId, spaceId]
    );
    if (!lastMovement || lastMovement.action_type !== "saida") {
      return json2({ message: "Este equipamento n\xE3o possui sa\xEDda pendente neste evento" }, 409);
    }
    await executeIdempotentMutationBatch(env, {
      operation: "equipment-checkin",
      operations: [
        {
          sql: `INSERT INTO equipment_events
                          (equipment_id, event_id, space_id, action_type, performed_by_username, request_id)
                          VALUES (?, ?, ?, 'entrada', ?, ?)`,
          params: [resolvedEquipmentId, eventId, spaceId, performedByUsername, mutationRequestId]
        }
      ],
      verificationSql: `SELECT id FROM equipment_events
                              WHERE request_id = ?
                                AND equipment_id = ?
                                AND event_id = ?
                                AND COALESCE(space_id, 0) = COALESCE(?, 0)
                                AND action_type = 'entrada'`,
      verificationParams: [mutationRequestId, resolvedEquipmentId, eventId, spaceId]
    });
    return json2({ success: true, equipment, requestId: mutationRequestId });
  }
  const cableMovementMatch = pathname.match(/^\/api\/cable-events\/(saida|entrada)$/);
  if (cableMovementMatch && request.method === "POST") {
    const type = cableMovementMatch[1];
    const body = await readJson(request);
    const cableId = Number(body.cableId);
    const eventId = Number(body.eventId);
    const quantity = Number(body.quantity);
    if (!cableId || !eventId || !Number.isInteger(quantity) || quantity <= 0) {
      return json2({ message: "cableId, eventId e quantity s\xE3o obrigat\xF3rios" }, 400);
    }
    const mutationRequestId = getMutationRequestId(request, body);
    const [cableResult, eventResult] = await executeBatch(env, [
      { sql: "SELECT * FROM cables WHERE id = ?", params: [cableId] },
      { sql: "SELECT * FROM events WHERE id = ?", params: [eventId] }
    ]);
    const cable = cableResult?.results?.[0] || null;
    const event = eventResult?.results?.[0] || null;
    if (!cable) return json2({ message: "Cabo n\xE3o encontrado" }, 404);
    if (!event) return json2({ message: "Evento n\xE3o encontrado" }, 404);
    const spaceId = await resolveEventSpaceId2(env, eventId, body.spaceId);
    const existingMovementRequest = await queryFirst(
      env,
      `SELECT id FROM cable_event_movements
             WHERE request_id = ?
               AND cable_id = ?
               AND event_id = ?
               AND COALESCE(space_id, 0) = COALESCE(?, 0)
               AND action_type = ?
               AND quantity = ?`,
      [mutationRequestId, cableId, eventId, spaceId, type, quantity]
    );
    if (existingMovementRequest) {
      return json2({ success: true, requestId: mutationRequestId, replayed: true });
    }
    if (type === "saida") {
      if (Number(cable.available_quantity) < quantity) {
        return json2({ message: "Quantidade insuficiente em estoque" }, 409);
      }
      await executeIdempotentMutationBatch(env, {
        operation: "cable-checkout",
        operations: [
          {
            sql: `INSERT INTO cable_event_movements
                              (cable_id, event_id, space_id, action_type, quantity, request_id)
                              VALUES (?, ?, ?, 'saida', ?, ?)`,
            params: [cableId, eventId, spaceId, quantity, mutationRequestId]
          },
          {
            sql: "UPDATE cables SET available_quantity = available_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            params: [quantity, cableId]
          }
        ],
        verificationSql: `SELECT id FROM cable_event_movements
                                  WHERE request_id = ?
                                    AND cable_id = ?
                                    AND event_id = ?
                                    AND COALESCE(space_id, 0) = COALESCE(?, 0)
                                    AND action_type = 'saida'
                                    AND quantity = ?`,
        verificationParams: [mutationRequestId, cableId, eventId, spaceId, quantity]
      });
      return json2({ success: true, requestId: mutationRequestId });
    }
    const pendingMovement = await queryFirst(
      env,
      `SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END), 0) AS quantity
             FROM cable_event_movements
             WHERE cable_id = ? AND event_id = ?
               AND ${spacePredicate("space_id")}`,
      [cableId, eventId, spaceId]
    );
    if (!pendingMovement || Number(pendingMovement.quantity) < quantity) {
      return json2({ message: "Este cabo n\xE3o possui sa\xEDda pendente suficiente neste evento" }, 409);
    }
    await executeIdempotentMutationBatch(env, {
      operation: "cable-checkin",
      operations: [
        {
          sql: `INSERT INTO cable_event_movements
                          (cable_id, event_id, space_id, action_type, quantity, request_id)
                          VALUES (?, ?, ?, 'entrada', ?, ?)`,
          params: [cableId, eventId, spaceId, quantity, mutationRequestId]
        },
        {
          sql: "UPDATE cables SET available_quantity = available_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          params: [quantity, cableId]
        }
      ],
      verificationSql: `SELECT id FROM cable_event_movements
                              WHERE request_id = ?
                                AND cable_id = ?
                                AND event_id = ?
                                AND COALESCE(space_id, 0) = COALESCE(?, 0)
                                AND action_type = 'entrada'
                                AND quantity = ?`,
      verificationParams: [mutationRequestId, cableId, eventId, spaceId, quantity]
    });
    return json2({ success: true, requestId: mutationRequestId });
  }
  const otherItemMovementMatch = pathname.match(/^\/api\/other-item-events\/(saida|entrada)$/);
  if (otherItemMovementMatch && request.method === "POST") {
    const type = otherItemMovementMatch[1];
    const body = await readJson(request);
    const itemId = Number(body.itemId);
    const eventId = Number(body.eventId);
    const quantity = Number(body.quantity);
    if (!itemId || !eventId || !Number.isInteger(quantity) || quantity <= 0) {
      return json2({ message: "itemId, eventId e quantity s\xE3o obrigat\xF3rios" }, 400);
    }
    const mutationRequestId = getMutationRequestId(request, body);
    const [itemResult, eventResult] = await executeBatch(env, [
      { sql: "SELECT * FROM other_items WHERE id = ?", params: [itemId] },
      { sql: "SELECT * FROM events WHERE id = ?", params: [eventId] }
    ]);
    const item = itemResult?.results?.[0] || null;
    const event = eventResult?.results?.[0] || null;
    if (!item) return json2({ message: "Item n\xE3o encontrado" }, 404);
    if (!event) return json2({ message: "Evento n\xE3o encontrado" }, 404);
    const spaceId = await resolveEventSpaceId2(env, eventId, body.spaceId);
    const existingMovementRequest = await queryFirst(
      env,
      `SELECT id FROM other_item_event_movements
             WHERE request_id = ?
               AND item_id = ?
               AND event_id = ?
               AND COALESCE(space_id, 0) = COALESCE(?, 0)
               AND action_type = ?
               AND quantity = ?`,
      [mutationRequestId, itemId, eventId, spaceId, type, quantity]
    );
    if (existingMovementRequest) {
      return json2({ success: true, requestId: mutationRequestId, replayed: true });
    }
    if (type === "saida") {
      if (Number(item.available_quantity) < quantity) {
        return json2({ message: "Quantidade insuficiente em estoque" }, 409);
      }
      await executeIdempotentMutationBatch(env, {
        operation: "other-item-checkout",
        operations: [
          {
            sql: `INSERT INTO other_item_event_movements
                              (item_id, event_id, space_id, action_type, quantity, request_id)
                              VALUES (?, ?, ?, 'saida', ?, ?)`,
            params: [itemId, eventId, spaceId, quantity, mutationRequestId]
          },
          {
            sql: "UPDATE other_items SET available_quantity = available_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            params: [quantity, itemId]
          }
        ],
        verificationSql: `SELECT id FROM other_item_event_movements
                                  WHERE request_id = ?
                                    AND item_id = ?
                                    AND event_id = ?
                                    AND COALESCE(space_id, 0) = COALESCE(?, 0)
                                    AND action_type = 'saida'
                                    AND quantity = ?`,
        verificationParams: [mutationRequestId, itemId, eventId, spaceId, quantity]
      });
      return json2({ success: true, requestId: mutationRequestId });
    }
    const pendingMovement = await queryFirst(
      env,
      `SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END), 0) AS quantity
             FROM other_item_event_movements
             WHERE item_id = ? AND event_id = ?
               AND ${spacePredicate("space_id")}`,
      [itemId, eventId, spaceId]
    );
    if (!pendingMovement || Number(pendingMovement.quantity) < quantity) {
      return json2({ message: "Este item n\xE3o possui sa\xEDda pendente suficiente neste evento" }, 409);
    }
    await executeIdempotentMutationBatch(env, {
      operation: "other-item-checkin",
      operations: [
        {
          sql: `INSERT INTO other_item_event_movements
                          (item_id, event_id, space_id, action_type, quantity, request_id)
                          VALUES (?, ?, ?, 'entrada', ?, ?)`,
          params: [itemId, eventId, spaceId, quantity, mutationRequestId]
        },
        {
          sql: "UPDATE other_items SET available_quantity = available_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          params: [quantity, itemId]
        }
      ],
      verificationSql: `SELECT id FROM other_item_event_movements
                              WHERE request_id = ?
                                AND item_id = ?
                                AND event_id = ?
                                AND COALESCE(space_id, 0) = COALESCE(?, 0)
                                AND action_type = 'entrada'
                                AND quantity = ?`,
      verificationParams: [mutationRequestId, itemId, eventId, spaceId, quantity]
    });
    return json2({ success: true, requestId: mutationRequestId });
  }
  const quoteOtherItemMovementMatch = pathname.match(/^\/api\/quote-other-item-events\/(saida|entrada)$/);
  if (quoteOtherItemMovementMatch && request.method === "POST") {
    const type = quoteOtherItemMovementMatch[1];
    const body = await readJson(request);
    const quoteItemId = Number(body.quoteItemId);
    const eventId = Number(body.eventId);
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quoteItemId) || quoteItemId <= 0 || !Number.isInteger(eventId) || eventId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
      return json2({ message: "quoteItemId, eventId e quantidade s\xE3o obrigat\xF3rios" }, 400);
    }
    const mutationRequestId = getMutationRequestId(request, body);
    const quoteItem = await queryFirst(
      env,
      `SELECT quote_items.id,
                    quote_items.description,
                    quote_items.quantity
             FROM quote_items
             INNER JOIN events ON events.orcamento_id = quote_items.quote_id
             WHERE quote_items.id = ?
               AND events.id = ?
               AND COALESCE(quote_items.is_manual, 0) = 1`,
      [quoteItemId, eventId]
    );
    if (!quoteItem) {
      return json2({ message: "Equipamento avulso n\xE3o encontrado neste evento" }, 404);
    }
    const spaceId = await resolveEventSpaceId2(env, eventId, body.spaceId);
    const existingMovementRequest = await queryFirst(
      env,
      `SELECT id FROM quote_manual_item_movements
             WHERE request_id = ?
               AND quote_item_id = ?
               AND event_id = ?
               AND COALESCE(space_id, 0) = COALESCE(?, 0)
               AND action_type = ?
               AND quantity = ?`,
      [mutationRequestId, quoteItemId, eventId, spaceId, type, quantity]
    );
    if (existingMovementRequest) {
      return json2({ success: true, requestId: mutationRequestId, replayed: true });
    }
    if (type === "saida") {
      const totals = await queryFirst(
        env,
        `SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE 0 END), 0) AS saida
                 FROM quote_manual_item_movements
                 WHERE quote_item_id = ? AND event_id = ?`,
        [quoteItemId, eventId]
      );
      if (Number(totals?.saida) + quantity > Number(quoteItem.quantity)) {
        return json2({ message: "A quantidade de sa\xEDda ultrapassa a quantidade informada no or\xE7amento" }, 409);
      }
    } else {
      const pendingMovement = await queryFirst(
        env,
        `SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END), 0) AS quantity
                 FROM quote_manual_item_movements
                 WHERE quote_item_id = ? AND event_id = ?
                   AND ${spacePredicate("space_id")}`,
        [quoteItemId, eventId, spaceId]
      );
      if (Number(pendingMovement?.quantity) < quantity) {
        return json2({ message: "Este equipamento avulso n\xE3o possui sa\xEDda pendente suficiente neste evento" }, 409);
      }
    }
    await executeIdempotentMutationBatch(env, {
      operation: `quote-manual-item-${type}`,
      operations: [{
        sql: `INSERT INTO quote_manual_item_movements
                      (quote_item_id, event_id, space_id, action_type, quantity, request_id)
                      VALUES (?, ?, ?, ?, ?, ?)`,
        params: [quoteItemId, eventId, spaceId, type, quantity, mutationRequestId]
      }],
      verificationSql: `SELECT id FROM quote_manual_item_movements
                              WHERE request_id = ?
                                AND quote_item_id = ?
                                AND event_id = ?
                                AND COALESCE(space_id, 0) = COALESCE(?, 0)
                                AND action_type = ?
                                AND quantity = ?`,
      verificationParams: [mutationRequestId, quoteItemId, eventId, spaceId, type, quantity]
    });
    return json2({ success: true, requestId: mutationRequestId });
  }
  if (pathname === "/api/maintenances" && request.method === "POST") {
    const body = await readJson(request);
    const equipmentId = Number(body.equipmentId);
    const description = String(body.description || "").trim();
    if (!equipmentId || !description) {
      return json2({ message: "equipmentId e description s\xE3o obrigat\xF3rios" }, 400);
    }
    const equipment = await queryFirst(env, "SELECT * FROM equipments WHERE id = ?", [equipmentId]);
    if (!equipment) return json2({ message: "Equipamento n\xE3o encontrado" }, 404);
    const [maintenanceResult] = await executeBatch(env, [
      {
        sql: `INSERT INTO maintenances (equipment_id, description)
                      SELECT ?, ?
                      WHERE EXISTS (SELECT 1 FROM equipments WHERE id = ?)
                        AND NOT EXISTS (
                          SELECT 1 FROM maintenances
                          WHERE equipment_id = ? AND description = ? AND resolved_at IS NULL
                      )`,
        params: [equipmentId, description, equipmentId, equipmentId, description]
      },
      {
        sql: "UPDATE equipments SET current_status = 'Em manutencao' WHERE id = ?",
        params: [equipmentId]
      }
    ]);
    if (Number(maintenanceResult?.meta?.changes) === 0) {
      const currentEquipment = await queryFirst(env, "SELECT id FROM equipments WHERE id = ?", [equipmentId]);
      if (!currentEquipment) {
        return json2({ message: "O equipamento foi exclu\xEDdo durante a opera\xE7\xE3o. Atualize a tela." }, 409);
      }
    }
    return json2({ success: true });
  }
  if (pathname === "/api/cable-maintenances" && request.method === "POST") {
    const body = await readJson(request);
    const cableId = Number(body.cableId);
    const description = String(body.description || "").trim();
    if (!cableId || !description) {
      return json2({ message: "cableId e description s\xE3o obrigat\xF3rios" }, 400);
    }
    const cable = await queryFirst(env, "SELECT * FROM cables WHERE id = ?", [cableId]);
    if (!cable) return json2({ message: "Cabo n\xE3o encontrado" }, 404);
    const [maintenanceResult] = await executeBatch(env, [{
      sql: `INSERT INTO cable_maintenances (cable_id, description)
                  SELECT ?, ?
                  WHERE EXISTS (SELECT 1 FROM cables WHERE id = ?)
                    AND NOT EXISTS (
                      SELECT 1 FROM cable_maintenances
                      WHERE cable_id = ? AND description = ? AND resolved_at IS NULL
                  )`,
      params: [cableId, description, cableId, cableId, description]
    }]);
    if (Number(maintenanceResult?.meta?.changes) === 0) {
      const currentCable = await queryFirst(env, "SELECT id FROM cables WHERE id = ?", [cableId]);
      if (!currentCable) {
        return json2({ message: "O cabo foi exclu\xEDdo durante a opera\xE7\xE3o. Atualize a tela." }, 409);
      }
    }
    return json2({ success: true });
  }
  const maintenanceReadyMatch = pathname.match(/^\/api\/maintenances\/(\d+)\/ready$/);
  if (maintenanceReadyMatch && request.method === "PATCH") {
    const equipmentId = Number(maintenanceReadyMatch[1]);
    if (!equipmentId) return json2({ message: "equipmentId \xE9 obrigat\xF3rio" }, 400);
    const equipment = await queryFirst(env, "SELECT * FROM equipments WHERE id = ?", [equipmentId]);
    if (!equipment) return json2({ message: "Equipamento n\xE3o encontrado" }, 404);
    await executeBatch(env, [
      {
        sql: `UPDATE maintenances
                      SET resolved_at = CURRENT_TIMESTAMP
                      WHERE equipment_id = ?
                        AND resolved_at IS NULL`,
        params: [equipmentId]
      },
      {
        sql: `UPDATE equipments
                      SET current_status = CASE
                          WHEN EXISTS (
                              SELECT 1 FROM maintenances
                              WHERE maintenances.equipment_id = equipments.id
                                AND maintenances.resolved_at IS NULL
                          ) THEN 'Em manutencao'
                          WHEN EXISTS (
                              SELECT 1
                              FROM equipment_events AS outgoing
                              WHERE outgoing.equipment_id = equipments.id
                                AND outgoing.action_type = 'saida'
                                AND NOT EXISTS (
                                    SELECT 1
                                    FROM equipment_events AS incoming
                                    WHERE incoming.equipment_id = outgoing.equipment_id
                                      AND incoming.event_id = outgoing.event_id
                                      AND COALESCE(incoming.space_id, 0) = COALESCE(outgoing.space_id, 0)
                                      AND incoming.action_type = 'entrada'
                                      AND (
                                          datetime(incoming.created_at) > datetime(outgoing.created_at)
                                          OR (
                                              datetime(incoming.created_at) = datetime(outgoing.created_at)
                                              AND incoming.id > outgoing.id
                                          )
                                      )
                                )
                          ) THEN 'Indisponivel'
                          ELSE 'Disponivel'
                      END
                      WHERE id = ?`,
        params: [equipmentId]
      }
    ]);
    return json2({ success: true });
  }
  const cableMaintenanceReadyMatch = pathname.match(/^\/api\/cable-maintenances\/(\d+)\/ready$/);
  if (cableMaintenanceReadyMatch && request.method === "PATCH") {
    const cableId = Number(cableMaintenanceReadyMatch[1]);
    if (!cableId) return json2({ message: "cableId \xE9 obrigat\xF3rio" }, 400);
    const cable = await queryFirst(env, "SELECT * FROM cables WHERE id = ?", [cableId]);
    if (!cable) return json2({ message: "Cabo n\xE3o encontrado" }, 404);
    await execute(
      env,
      `UPDATE cable_maintenances
             SET resolved_at = CURRENT_TIMESTAMP
             WHERE cable_id = ?
               AND resolved_at IS NULL`,
      [cableId]
    );
    return json2({ success: true });
  }
  return json2({ error: "Rota n\xE3o encontrada" }, 404);
}
__name(handleApiRequest, "handleApiRequest");
async function login(request, env) {
  const body = await readJson(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) {
    return json2({ error: "Usu\xE1rio e senha s\xE3o obrigat\xF3rios" }, 400);
  }
  const user = await queryFirst(env, "SELECT * FROM users WHERE username = ?", [username]);
  if (!user || !import_bcryptjs.default.compareSync(password, user.password)) {
    return json2({ error: "Incorreto" }, 401);
  }
  const sessionId = crypto.randomUUID();
  const expiresAt = toSqliteDate(new Date(Date.now() + SESSION_DURATION_SECONDS * 1e3));
  await executeIdempotent(
    env,
    `INSERT INTO sessions (id, user_id, expires_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
    [sessionId, user.id, expiresAt],
    "create-session"
  );
  const storedSession = await queryFirst(
    env,
    "SELECT id, user_id FROM sessions WHERE id = ?",
    [sessionId]
  );
  if (!storedSession || Number(storedSession.user_id) !== Number(user.id)) {
    throw new Error("A sess\xE3o n\xE3o p\xF4de ser confirmada no banco de dados");
  }
  await runBestEffortD1Cleanup(
    () => cleanupExpiredSessions(env),
    "expired-sessions-after-login"
  );
  await runBestEffortD1Cleanup(
    () => cleanupCurrentSessionBeforeLogin(request, env),
    "current-session-after-login"
  );
  if (user.username === TEST_USERNAME) {
    await runBestEffortD1Cleanup(
      () => clearAllTestUserSessions(env, sessionId),
      "old-test-sessions-after-login"
    );
  }
  return json2(
    { success: true, isTestUser: user.username === TEST_USERNAME },
    200,
    { "Set-Cookie": await buildSessionCookie(sessionId, request, env) }
  );
}
__name(login, "login");
async function cleanupCurrentSessionBeforeLogin(request, env) {
  const currentSession = await getSessionFromRequest(request, env);
  if (!currentSession) {
    return;
  }
  if (currentSession.username === TEST_USERNAME) {
    await clearTestSnapshot(env, currentSession.id);
  }
  await execute(env, "DELETE FROM sessions WHERE id = ?", [currentSession.id]);
}
__name(cleanupCurrentSessionBeforeLogin, "cleanupCurrentSessionBeforeLogin");
async function runBestEffortD1Cleanup(cleanup, operation) {
  try {
    await cleanup();
  } catch (error) {
    if (!isD1UnavailableError(error)) throw error;
    console.warn(JSON.stringify({
      message: "d1 cleanup postponed after transient error",
      operation,
      error: getD1ErrorMessage(error)
    }));
  }
}
__name(runBestEffortD1Cleanup, "runBestEffortD1Cleanup");
async function logout(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (session) {
    if (session.username === TEST_USERNAME) {
      await clearTestSnapshot(env, session.id);
    }
    await execute(env, "DELETE FROM sessions WHERE id = ?", [session.id]);
  }
  return json2(
    { success: true },
    200,
    { "Set-Cookie": clearSessionCookie(request) }
  );
}
__name(logout, "logout");
async function getScheduledEvents(env) {
  const hasQuoteSchema = await tableExists(env, "quotes") && await tableExists(env, "event_reserved_equipments") && await tableHasColumn(env, "events", "orcamento_id") && await tableHasColumn(env, "events", "end_date") && await tableHasColumn(env, "events", "auto_created_at");
  if (!hasQuoteSchema) {
    return json2({ events: [] });
  }
  const hasManualMovements = await tableExists(env, "quote_manual_item_movements");
  const events = await queryAll(
    env,
    `SELECT events.id,
                events.name,
                events.date,
                events.end_date AS endDate,
                events.orcamento_id AS quoteId,
                events.auto_created_at AS autoCreatedAt,
                quotes.event_name AS quoteEventName,
                quotes.client_name AS clientName
         FROM events
         INNER JOIN quotes ON quotes.id = events.orcamento_id
         WHERE events.orcamento_id IS NOT NULL
         ORDER BY events.date ASC, events.id ASC`
  );
  for (const event of events) {
    const reservedEquipments = await queryAll(
      env,
      `SELECT equipments.id,
                    equipments.name,
                    equipments.barcode,
                    COALESCE(equipments.category, 'Outros') AS category
             FROM event_reserved_equipments reserved
             INNER JOIN equipments ON equipments.id = reserved.equipment_id
             WHERE reserved.event_id = ?
             ORDER BY lower(equipments.name) ASC, equipments.barcode ASC`,
      [Number(event.id)]
    );
    const movement = hasManualMovements ? await queryFirst(
      env,
      `SELECT (
                        SELECT COUNT(*) FROM equipment_events WHERE event_id = ?
                    ) + (
                        SELECT COUNT(*) FROM quote_manual_item_movements WHERE event_id = ?
                    ) AS movementCount,
                    (
                        SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN 1 ELSE -1 END), 0)
                        FROM equipment_events WHERE event_id = ?
                    ) + (
                        SELECT COALESCE(SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END), 0)
                        FROM quote_manual_item_movements WHERE event_id = ?
                    ) AS pendingQuantity`,
      [Number(event.id), Number(event.id), Number(event.id), Number(event.id)]
    ) : await queryFirst(
      env,
      `SELECT COUNT(*) AS movementCount,
                        COALESCE(SUM(CASE WHEN action_type = 'saida' THEN 1 ELSE -1 END), 0) AS pendingQuantity
                 FROM equipment_events
                 WHERE event_id = ?`,
      [Number(event.id)]
    );
    const movementCount = Number(movement?.movementCount) || 0;
    const pendingQuantity = Number(movement?.pendingQuantity) || 0;
    event.reservedEquipments = reservedEquipments;
    event.status = movementCount === 0 ? "Agendado" : pendingQuantity > 0 ? "Em andamento" : "Finalizado";
  }
  return json2({ events });
}
__name(getScheduledEvents, "getScheduledEvents");
async function getPriceItems(env, type, search = "") {
  const config = PRICE_TABLES[type];
  if (!config || !await tableExists(env, config.table)) {
    return [];
  }
  const hasUnitPrice = await tableHasColumn(env, config.table, "unit_price");
  const hasCategory = config.categoryColumn ? await tableHasColumn(env, config.table, config.categoryColumn) : false;
  const categoryExpression = hasCategory ? `COALESCE(${config.categoryColumn}, 'Outros')` : "'Outros'";
  const priceExpression = hasUnitPrice ? "COALESCE(unit_price, 1)" : "1";
  const hasSerialNumber = type === "equipment" && await tableHasColumn(env, config.table, "serial_number");
  const hasObservation = type === "equipment" && await tableHasColumn(env, config.table, "observation");
  const equipmentMetadataSelect = type === "equipment" ? `,
                ${hasSerialNumber ? "serial_number" : "NULL"} AS serialNumber,
                ${hasObservation ? "observation" : "NULL"} AS observation` : "";
  return queryAll(
    env,
    `SELECT id,
                name,
                ${categoryExpression} AS category,
                ${priceExpression} AS unitPrice
                ${equipmentMetadataSelect}
         FROM ${config.table}
         WHERE name LIKE ?
         ORDER BY category ASC, name ASC`,
    [`%${search}%`]
  );
}
__name(getPriceItems, "getPriceItems");
async function getQuoteDatabaseEquipments(env, search = "") {
  if (!await tableExists(env, "equipments")) {
    return [];
  }
  const hasUnitPrice = await tableHasColumn(env, "equipments", "unit_price");
  const hasCategory = await tableHasColumn(env, "equipments", "category");
  const hasSerialNumber = await tableHasColumn(env, "equipments", "serial_number");
  const hasObservation = await tableHasColumn(env, "equipments", "observation");
  const hasHiddenTable = await tableExists(env, "quote_hidden_equipments");
  const categoryExpression = hasCategory ? "COALESCE(equipments.category, 'Outros')" : "'Outros'";
  const priceExpression = hasUnitPrice ? "COALESCE(equipments.unit_price, 1)" : "1";
  const serialNumberExpression = hasSerialNumber ? "equipments.serial_number" : "NULL";
  const observationExpression = hasObservation ? "equipments.observation" : "NULL";
  const hiddenSelect = hasHiddenTable ? `CASE WHEN quote_hidden_equipments.equipment_id IS NULL THEN 0 ELSE 1 END AS hiddenFromQuotes,
           quote_hidden_equipments.hidden_at AS hiddenAt,
           quote_hidden_equipments.hidden_by_username AS hiddenByUsername` : `0 AS hiddenFromQuotes,
           NULL AS hiddenAt,
           NULL AS hiddenByUsername`;
  const hiddenJoin = hasHiddenTable ? `LEFT JOIN quote_hidden_equipments
             ON quote_hidden_equipments.equipment_id = equipments.id` : "";
  const observationSearch = hasObservation ? "OR COALESCE(equipments.observation, '') LIKE ?" : "";
  const categorySearch = hasCategory ? "OR COALESCE(equipments.category, '') LIKE ?" : "";
  const params = [`%${search}%`, `%${search}%`];
  if (hasObservation) params.push(`%${search}%`);
  if (hasCategory) params.push(`%${search}%`);
  const rows = await queryAll(
    env,
    `SELECT equipments.id,
                equipments.name,
                equipments.barcode,
                ${serialNumberExpression} AS serialNumber,
                ${observationExpression} AS observation,
                equipments.current_status AS currentStatus,
                ${categoryExpression} AS category,
                ${priceExpression} AS unitPrice,
                ${hiddenSelect}
         FROM equipments
         ${hiddenJoin}
         WHERE equipments.name LIKE ?
            OR equipments.barcode LIKE ?
            ${observationSearch}
            ${categorySearch}
         ORDER BY hiddenFromQuotes ASC,
                  lower(category) ASC,
                  lower(equipments.name) ASC,
                  equipments.barcode ASC`,
    params
  );
  return rows.map(serializeQuoteDatabaseEquipment2);
}
__name(getQuoteDatabaseEquipments, "getQuoteDatabaseEquipments");
async function getAvailableQuoteEquipments(env, search = "") {
  if (!await tableExists(env, "equipments")) {
    return [];
  }
  const hasUnitPrice = await tableHasColumn(env, "equipments", "unit_price");
  const hasCategory = await tableHasColumn(env, "equipments", "category");
  const hasSerialNumber = await tableHasColumn(env, "equipments", "serial_number");
  const hasObservation = await tableHasColumn(env, "equipments", "observation");
  const hasHiddenTable = await tableExists(env, "quote_hidden_equipments");
  const categoryExpression = hasCategory ? "COALESCE(category, 'Outros')" : "'Outros'";
  const priceExpression = hasUnitPrice ? "COALESCE(unit_price, 1)" : "1";
  const serialNumberExpression = hasSerialNumber ? "serial_number" : "NULL";
  const observationExpression = hasObservation ? "observation" : "NULL";
  const hiddenPredicate = hasHiddenTable ? `AND NOT EXISTS (
               SELECT 1
               FROM quote_hidden_equipments
               WHERE quote_hidden_equipments.equipment_id = equipments.id
           )` : "";
  const searchLike = `%${search}%`;
  const exactTopic = search.toLocaleLowerCase("pt-BR");
  const observationSearch = hasObservation ? "OR COALESCE(observation, '') LIKE ?" : "";
  const params = [searchLike, searchLike];
  if (hasObservation) params.push(searchLike);
  params.push(searchLike, exactTopic, searchLike, searchLike);
  const rows = await queryAll(
    env,
    `SELECT id,
                name,
                barcode,
                ${serialNumberExpression} AS serialNumber,
                ${observationExpression} AS observation,
                current_status AS currentStatus,
                ${categoryExpression} AS category,
                ${priceExpression} AS unitPrice
         FROM equipments
         WHERE (
                name LIKE ?
                OR barcode LIKE ?
                ${observationSearch}
                OR ${categoryExpression} LIKE ?
           )
           ${hiddenPredicate}
         ORDER BY CASE
                WHEN lower(${categoryExpression}) = ? THEN 0
                WHEN ${categoryExpression} LIKE ? THEN 1
                WHEN name LIKE ? THEN 2
                ELSE 3
            END,
            lower(${categoryExpression}) ASC,
            lower(name) ASC,
            barcode ASC
         LIMIT 300`,
    params
  );
  return rows.filter((equipment) => !isMaintenanceStatus(equipment.currentStatus)).map(serializeQuoteEquipment2);
}
__name(getAvailableQuoteEquipments, "getAvailableQuoteEquipments");
function serializeQuoteEquipment2(row) {
  return {
    id: Number(row.id),
    name: row.name,
    barcode: row.barcode,
    category: row.category || "Outros",
    serialNumber: row.serialNumber || row.serial_number || "",
    observation: row.observation || "",
    currentStatus: row.currentStatus || row.current_status || "",
    unitPrice: roundMoney2(parseMoneyValue2(row.unitPrice ?? row.unit_price ?? 1))
  };
}
__name(serializeQuoteEquipment2, "serializeQuoteEquipment");
function serializeQuoteDatabaseEquipment2(row) {
  return {
    ...serializeQuoteEquipment2(row),
    hiddenFromQuotes: Number(row.hiddenFromQuotes || row.hidden_from_quotes || 0) === 1,
    hiddenAt: row.hiddenAt || row.hidden_at || null,
    hiddenByUsername: row.hiddenByUsername || row.hidden_by_username || null
  };
}
__name(serializeQuoteDatabaseEquipment2, "serializeQuoteDatabaseEquipment");
async function getSessionFromRequest(request, env) {
  const secret = env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET n\xE3o configurado no Worker");
  }
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const rawValue = cookies[SESSION_COOKIE_NAME];
  if (!rawValue) return null;
  const [sessionId, signature] = rawValue.split(".");
  if (!sessionId || !signature) return null;
  const expectedSignature = await signValue(sessionId, secret);
  if (signature !== expectedSignature) return null;
  const session = await queryFirst(
    env,
    `SELECT sessions.id, sessions.user_id, sessions.expires_at, users.username, COALESCE(users.role, 'user') AS role
         FROM sessions
         INNER JOIN users ON users.id = sessions.user_id
         WHERE sessions.id = ?
           AND sessions.expires_at > ?`,
    [sessionId, toSqliteDate(/* @__PURE__ */ new Date())]
  );
  if (!session) {
    return null;
  }
  return session;
}
__name(getSessionFromRequest, "getSessionFromRequest");
function isAdminSession2(session) {
  return session?.role === "admin";
}
__name(isAdminSession2, "isAdminSession");
function canAccessQuotes2(session) {
  const role = normalizeUserRole2(session?.role);
  return role === "admin" || role === "comercial";
}
__name(canAccessQuotes2, "canAccessQuotes");
function canAccessOperators(session) {
  const role = normalizeUserRole2(session?.role);
  return role === "admin" || role === "comercial";
}
__name(canAccessOperators, "canAccessOperators");
function normalizeUserRole2(role) {
  const normalized = String(role || "user").trim().toLowerCase();
  return USER_ROLES2.has(normalized) ? normalized : "user";
}
__name(normalizeUserRole2, "normalizeUserRole");
function canShowInitialQuantityEdit(username) {
  return String(username || "").trim().toLowerCase() === INITIAL_QUANTITY_EDITOR_USERNAME;
}
__name(canShowInitialQuantityEdit, "canShowInitialQuantityEdit");
async function cleanupExpiredSessions(env) {
  const expiredTestSessions = await queryAll(
    env,
    `SELECT sessions.id
         FROM sessions
         INNER JOIN users ON users.id = sessions.user_id
         WHERE sessions.expires_at <= ?
           AND users.username = ?
         ORDER BY sessions.expires_at ASC`,
    [toSqliteDate(/* @__PURE__ */ new Date()), TEST_USERNAME]
  );
  for (const session of expiredTestSessions) {
    await clearTestSnapshot(env, session.id);
  }
  await execute(env, "DELETE FROM sessions WHERE expires_at <= ?", [toSqliteDate(/* @__PURE__ */ new Date())]);
}
__name(cleanupExpiredSessions, "cleanupExpiredSessions");
async function clearAllTestUserSessions(env, keepSessionId = null) {
  const testSessions = await queryAll(
    env,
    `SELECT sessions.id
         FROM sessions
         INNER JOIN users ON users.id = sessions.user_id
         WHERE users.username = ?
           AND (? IS NULL OR sessions.id <> ?)
         ORDER BY sessions.expires_at ASC`,
    [TEST_USERNAME, keepSessionId, keepSessionId]
  );
  if (testSessions.length === 0) {
    return;
  }
  for (const session of testSessions) {
    await clearTestSnapshot(env, session.id);
  }
  await execute(
    env,
    `DELETE FROM sessions
         WHERE id IN (${testSessions.map(() => "?").join(", ")})`,
    testSessions.map((session) => session.id)
  );
}
__name(clearAllTestUserSessions, "clearAllTestUserSessions");
async function clearTestSnapshot(env, snapshotId) {
  await execute(env, "DELETE FROM test_snapshot_equipment_events WHERE snapshot_id = ?", [snapshotId]);
  await execute(env, "DELETE FROM test_snapshot_cable_event_movements WHERE snapshot_id = ?", [snapshotId]);
  await execute(env, "DELETE FROM test_snapshot_maintenances WHERE snapshot_id = ?", [snapshotId]);
  await execute(env, "DELETE FROM test_snapshot_events WHERE snapshot_id = ?", [snapshotId]);
  await execute(env, "DELETE FROM test_snapshot_equipments WHERE snapshot_id = ?", [snapshotId]);
  await execute(env, "DELETE FROM test_snapshot_cable_maintenances WHERE snapshot_id = ?", [snapshotId]);
  await execute(env, "DELETE FROM test_snapshot_cables WHERE snapshot_id = ?", [snapshotId]);
  await execute(env, "DELETE FROM test_snapshot_operators WHERE snapshot_id = ?", [snapshotId]);
}
__name(clearTestSnapshot, "clearTestSnapshot");
async function buildSessionCookie(sessionId, request, env) {
  const signature = await signValue(sessionId, env.SESSION_SECRET);
  const url = new URL(request.url);
  const isSecure = url.protocol === "https:";
  return [
    `${SESSION_COOKIE_NAME}=${sessionId}.${signature}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_DURATION_SECONDS}`,
    isSecure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}
__name(buildSessionCookie, "buildSessionCookie");
function clearSessionCookie(request) {
  const url = new URL(request.url);
  const isSecure = url.protocol === "https:";
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    isSecure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}
__name(clearSessionCookie, "clearSessionCookie");
async function signValue(value, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64Url(signature);
}
__name(signValue, "signValue");
async function verifyDeletePassword(password, env) {
  const passwordHash = String(env.DELETE_PASSWORD_HASH || "").trim();
  if (!passwordHash) {
    console.warn("DELETE_PASSWORD_HASH n\xE3o configurado no Worker.");
    return false;
  }
  return import_bcryptjs.default.compare(password, passwordHash);
}
__name(verifyDeletePassword, "verifyDeletePassword");
function canEditInitialQuantity(session, password) {
  const username = String(session?.username || "").trim().toLowerCase();
  return username === INITIAL_QUANTITY_EDITOR_USERNAME && String(password || "").trim() === INITIAL_QUANTITY_EDIT_PASSWORD;
}
__name(canEditInitialQuantity, "canEditInitialQuantity");
function httpError2(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
__name(httpError2, "httpError");
function parseOptionalSpaceId2(value) {
  if (value === void 0 || value === null || value === "") {
    return null;
  }
  const spaceId = Number(value);
  return Number.isInteger(spaceId) && spaceId > 0 ? spaceId : NaN;
}
__name(parseOptionalSpaceId2, "parseOptionalSpaceId");
async function resolveEventSpaceId2(env, eventId, value) {
  const spaceId = parseOptionalSpaceId2(value);
  if (Number.isNaN(spaceId)) {
    throw httpError2("Espa\xE7o inv\xE1lido", 400);
  }
  if (spaceId === null) {
    return null;
  }
  const space = await queryFirst(env, "SELECT id FROM event_spaces WHERE id = ? AND event_id = ?", [spaceId, eventId]);
  if (!space) {
    throw httpError2("Espa\xE7o n\xE3o encontrado neste evento", 404);
  }
  return spaceId;
}
__name(resolveEventSpaceId2, "resolveEventSpaceId");
function spacePredicate(columnName) {
  return `COALESCE(${columnName}, 0) = COALESCE(?, 0)`;
}
__name(spacePredicate, "spacePredicate");
async function getEventsByCompletion(env, eventType, completed) {
  const orderBy = eventType === "rental" ? "ORDER BY COALESCE(e.return_date, e.date) DESC, e.id DESC" : "ORDER BY e.date DESC, e.id DESC";
  const completionFilter = completed ? "COALESCE(movements.movement_count, 0) > 0 AND COALESCE(pending.pending_quantity, 0) = 0" : "(COALESCE(movements.movement_count, 0) = 0 OR COALESCE(pending.pending_quantity, 0) > 0)";
  return queryAll(
    env,
    `SELECT e.*
         FROM events e
         LEFT JOIN (
             SELECT event_id, COUNT(*) AS movement_count
             FROM (
                 SELECT event_id FROM equipment_events
                 UNION ALL SELECT event_id FROM cable_event_movements
                 UNION ALL SELECT event_id FROM other_item_event_movements
             ) movement_rows
             GROUP BY event_id
         ) movements ON movements.event_id = e.id
         LEFT JOIN (
             SELECT event_id, SUM(pending_quantity) AS pending_quantity
             FROM (
                 SELECT event_id,
                        SUM(CASE WHEN action_type = 'saida' THEN 1 ELSE -1 END) AS pending_quantity
                 FROM equipment_events
                 GROUP BY event_id, equipment_id, COALESCE(space_id, 0)
                 HAVING SUM(CASE WHEN action_type = 'saida' THEN 1 ELSE -1 END) > 0

                 UNION ALL

                 SELECT event_id,
                        SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS pending_quantity
                 FROM cable_event_movements
                 GROUP BY event_id, cable_id, COALESCE(space_id, 0)
                 HAVING SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) > 0

                 UNION ALL

                 SELECT event_id,
                        SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) AS pending_quantity
                 FROM other_item_event_movements
                 GROUP BY event_id, item_id, COALESCE(space_id, 0)
                 HAVING SUM(CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END) > 0
             ) pending_rows
             GROUP BY event_id
         ) pending ON pending.event_id = e.id
         WHERE COALESCE(e.event_type, 'event') = ?
           AND e.orcamento_id IS NULL
           AND ${completionFilter}
         ${orderBy}`,
    [eventType]
  );
}
__name(getEventsByCompletion, "getEventsByCompletion");
async function getRentalReturnAlerts(env, today) {
  const rentalEvents = await queryAll(
    env,
    `SELECT *
         FROM events
         WHERE COALESCE(event_type, 'event') = 'rental'
           AND return_date IS NOT NULL
           AND return_date <= ?
         ORDER BY return_date ASC, id ASC`,
    [today]
  );
  const alerts = [];
  for (const event of rentalEvents) {
    const pendingItems = await getPendingRentalItems(env, Number(event.id));
    if (pendingItems.length > 0) {
      alerts.push({ ...event, pendingItems });
    }
  }
  return alerts;
}
__name(getRentalReturnAlerts, "getRentalReturnAlerts");
async function getPendingRentalItems(env, eventId) {
  const equipments = await queryAll(
    env,
    `SELECT 'equipment' AS type,
                e.id AS item_id,
                e.name,
                e.barcode,
                SUM(CASE WHEN ee.action_type = 'saida' THEN 1 ELSE -1 END) AS quantity
         FROM equipment_events ee
         JOIN equipments e ON e.id = ee.equipment_id
         WHERE ee.event_id = ?
         GROUP BY e.id, e.name, e.barcode, COALESCE(ee.space_id, 0)
         HAVING SUM(CASE WHEN ee.action_type = 'saida' THEN 1 ELSE -1 END) > 0
         ORDER BY e.name ASC`,
    [eventId]
  );
  const cables = await queryAll(
    env,
    `SELECT 'cable' AS type,
                c.id AS item_id,
                c.name,
                NULL AS barcode,
                SUM(CASE WHEN cem.action_type = 'saida' THEN cem.quantity ELSE -cem.quantity END) AS quantity
         FROM cable_event_movements cem
         JOIN cables c ON c.id = cem.cable_id
         WHERE cem.event_id = ?
         GROUP BY c.id, c.name, COALESCE(cem.space_id, 0)
         HAVING SUM(CASE WHEN cem.action_type = 'saida' THEN cem.quantity ELSE -cem.quantity END) > 0
         ORDER BY c.name ASC`,
    [eventId]
  );
  const otherItems = await queryAll(
    env,
    `SELECT 'other' AS type,
                oi.id AS item_id,
                oi.name,
                NULL AS barcode,
                SUM(CASE WHEN oiem.action_type = 'saida' THEN oiem.quantity ELSE -oiem.quantity END) AS quantity
         FROM other_item_event_movements oiem
         JOIN other_items oi ON oi.id = oiem.item_id
         WHERE oiem.event_id = ?
         GROUP BY oi.id, oi.name, COALESCE(oiem.space_id, 0)
         HAVING SUM(CASE WHEN oiem.action_type = 'saida' THEN oiem.quantity ELSE -oiem.quantity END) > 0
         ORDER BY oi.name ASC`,
    [eventId]
  );
  return [...equipments, ...cables, ...otherItems].map((item) => ({
    ...item,
    quantity: Math.max(1, Number(item.quantity) || 1)
  }));
}
__name(getPendingRentalItems, "getPendingRentalItems");
async function deleteEventRecords(env, eventId) {
  await executeIdempotentBatch(env, [
    {
      sql: `UPDATE equipments
                  SET current_status = CASE
                      WHEN EXISTS (
                          SELECT 1 FROM maintenances
                          WHERE maintenances.equipment_id = equipments.id
                            AND maintenances.resolved_at IS NULL
                      ) THEN 'Em manutencao'
                      WHEN EXISTS (
                          SELECT 1
                          FROM equipment_events AS outgoing
                          WHERE outgoing.equipment_id = equipments.id
                            AND outgoing.event_id <> ?
                            AND outgoing.action_type = 'saida'
                            AND NOT EXISTS (
                                SELECT 1
                                FROM equipment_events AS incoming
                                WHERE incoming.equipment_id = outgoing.equipment_id
                                  AND incoming.event_id = outgoing.event_id
                                  AND COALESCE(incoming.space_id, 0) = COALESCE(outgoing.space_id, 0)
                                  AND incoming.action_type = 'entrada'
                                  AND (
                                      datetime(incoming.created_at) > datetime(outgoing.created_at)
                                      OR (
                                          datetime(incoming.created_at) = datetime(outgoing.created_at)
                                          AND incoming.id > outgoing.id
                                      )
                                  )
                            )
                      ) THEN 'Indisponivel'
                      ELSE 'Disponivel'
                  END
                  WHERE id IN (
                      SELECT equipment_id FROM equipment_events WHERE event_id = ?
                  )`,
      params: [eventId, eventId]
    },
    {
      sql: `UPDATE cables
                  SET available_quantity = available_quantity + (
                          SELECT COALESCE(SUM(
                              CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END
                          ), 0)
                          FROM cable_event_movements
                          WHERE cable_event_movements.cable_id = cables.id
                            AND cable_event_movements.event_id = ?
                      ),
                      updated_at = CURRENT_TIMESTAMP
                  WHERE EXISTS (
                      SELECT 1 FROM cable_event_movements
                      WHERE cable_event_movements.cable_id = cables.id
                        AND cable_event_movements.event_id = ?
                  )`,
      params: [eventId, eventId]
    },
    {
      sql: `UPDATE other_items
                  SET available_quantity = available_quantity + (
                          SELECT COALESCE(SUM(
                              CASE WHEN action_type = 'saida' THEN quantity ELSE -quantity END
                          ), 0)
                          FROM other_item_event_movements
                          WHERE other_item_event_movements.item_id = other_items.id
                            AND other_item_event_movements.event_id = ?
                      ),
                      updated_at = CURRENT_TIMESTAMP
                  WHERE EXISTS (
                      SELECT 1 FROM other_item_event_movements
                      WHERE other_item_event_movements.item_id = other_items.id
                        AND other_item_event_movements.event_id = ?
                  )`,
      params: [eventId, eventId]
    },
    { sql: "DELETE FROM quote_manual_item_movements WHERE event_id = ?", params: [eventId] },
    { sql: "DELETE FROM other_item_event_movements WHERE event_id = ?", params: [eventId] },
    { sql: "DELETE FROM cable_event_movements WHERE event_id = ?", params: [eventId] },
    { sql: "DELETE FROM equipment_events WHERE event_id = ?", params: [eventId] },
    { sql: "DELETE FROM event_saida_hidden_items WHERE event_id = ?", params: [eventId] },
    { sql: "DELETE FROM event_reserved_equipments WHERE event_id = ?", params: [eventId] },
    { sql: "DELETE FROM event_spaces WHERE event_id = ?", params: [eventId] },
    { sql: "DELETE FROM events WHERE id = ?", params: [eventId] }
  ], "delete-event");
}
__name(deleteEventRecords, "deleteEventRecords");
async function ensureColumn(env, tableName, columnName, columnDefinition) {
  const columns = await queryAll(env, `PRAGMA table_info(${tableName})`);
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  await execute(env, `ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
}
__name(ensureColumn, "ensureColumn");
async function queryAll(env, sql, params = []) {
  const run = /* @__PURE__ */ __name(() => env.DB.prepare(sql).bind(...params).all(), "run");
  let result;
  if (isRetrySafeSql(sql)) {
    result = await withD1Retry(run, d1RetryOptions("query-all"));
  } else {
    try {
      result = await run();
    } catch (error) {
      throw protectD1WriteOutcome("query-all-write", error);
    }
  }
  return result.results || [];
}
__name(queryAll, "queryAll");
async function queryFirst(env, sql, params = []) {
  const run = /* @__PURE__ */ __name(() => env.DB.prepare(sql).bind(...params).first(), "run");
  if (isRetrySafeSql(sql)) {
    return withD1Retry(run, d1RetryOptions("query-first"));
  }
  try {
    return await run();
  } catch (error) {
    throw protectD1WriteOutcome("query-first-write", error);
  }
}
__name(queryFirst, "queryFirst");
async function execute(env, sql, params = []) {
  const run = /* @__PURE__ */ __name(() => env.DB.prepare(sql).bind(...params).run(), "run");
  if (isRetrySafeSql(sql)) {
    return withD1Retry(run, d1RetryOptions("idempotent-execute"));
  }
  try {
    return await run();
  } catch (error) {
    throw protectD1WriteOutcome("execute-write", error);
  }
}
__name(execute, "execute");
async function executeIdempotent(env, sql, params = [], operation = "idempotent-write") {
  return withD1Retry(
    () => env.DB.prepare(sql).bind(...params).run(),
    d1RetryOptions(operation)
  );
}
__name(executeIdempotent, "executeIdempotent");
async function executeBatch(env, operations = []) {
  if (!operations.length) return [];
  const run = /* @__PURE__ */ __name(() => runD1Batch(env, operations), "run");
  if (operations.every(({ sql }) => isRetrySafeSql(sql))) {
    return withD1Retry(run, d1RetryOptions("read-only-batch"));
  }
  try {
    return await run();
  } catch (error) {
    throw protectD1WriteOutcome("batch-write", error);
  }
}
__name(executeBatch, "executeBatch");
async function executeIdempotentBatch(env, operations = [], operation = "idempotent-batch") {
  if (!operations.length) return [];
  return withD1Retry(
    () => runD1Batch(env, operations),
    d1RetryOptions(operation)
  );
}
__name(executeIdempotentBatch, "executeIdempotentBatch");
function runD1Batch(env, operations) {
  const statements = operations.map(({ sql, params = [] }) => env.DB.prepare(sql).bind(...params));
  return env.DB.batch(statements);
}
__name(runD1Batch, "runD1Batch");
function getMutationRequestId(request, body = {}) {
  const supplied = String(
    request.headers.get("Idempotency-Key") || body.requestId || body.request_id || ""
  ).trim();
  if (!supplied) return crypto.randomUUID();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(supplied)) {
    const error = new Error("Chave de idempot\xEAncia inv\xE1lida");
    error.statusCode = 400;
    throw error;
  }
  return supplied;
}
__name(getMutationRequestId, "getMutationRequestId");
function isUniqueConstraintError2(error) {
  return getD1ErrorMessage(error).toLowerCase().includes("unique constraint failed");
}
__name(isUniqueConstraintError2, "isUniqueConstraintError");
async function executeIdempotentMutationBatch(env, options) {
  const {
    operations,
    verificationSql,
    verificationParams,
    operation
  } = options;
  return withD1Retry(async () => {
    try {
      return await runD1Batch(env, operations);
    } catch (error) {
      if (!isD1UnavailableError(error) && !isUniqueConstraintError2(error)) {
        throw error;
      }
      try {
        const existing = await queryFirst(env, verificationSql, verificationParams);
        if (existing) {
          return { replayed: true, results: [] };
        }
      } catch (verificationError) {
        throw verificationError;
      }
      if (isUniqueConstraintError2(error)) {
        const conflict = new Error("Esta chave de idempot\xEAncia j\xE1 foi usada em outra movimenta\xE7\xE3o");
        conflict.statusCode = 409;
        throw conflict;
      }
      throw error;
    }
  }, d1RetryOptions(operation));
}
__name(executeIdempotentMutationBatch, "executeIdempotentMutationBatch");
function d1RetryOptions(operation) {
  return {
    maxAttempts: 6,
    baseDelayMs: 50,
    maxDelayMs: 800,
    onRetry: /* @__PURE__ */ __name(({ attempt, delayMs, error }) => {
      console.warn(JSON.stringify({
        message: "d1 transient error; retry scheduled",
        operation,
        attempt,
        delayMs,
        error: getD1ErrorMessage(error)
      }));
    }, "onRetry")
  };
}
__name(d1RetryOptions, "d1RetryOptions");
async function tableExists(env, tableName) {
  const row = await queryFirst(
    env,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  return !!row;
}
__name(tableExists, "tableExists");
async function tableHasColumn(env, tableName, columnName) {
  if (!/^[A-Za-z0-9_]+$/.test(tableName)) return false;
  const columns = await queryAll(env, `PRAGMA table_info(${tableName})`);
  return columns.some((column) => column.name === columnName);
}
__name(tableHasColumn, "tableHasColumn");
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
__name(readJson, "readJson");
function json2(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}
__name(json2, "json");
function getRequestId(request) {
  return request?.headers?.get("cf-ray") || crypto.randomUUID();
}
__name(getRequestId, "getRequestId");
function databaseWriteOutcomeUnknownResponse(error, request = null) {
  const requestId = getRequestId(request);
  console.error(JSON.stringify({
    message: "d1 write outcome unknown",
    requestId,
    method: request?.method || null,
    path: request?.url ? new URL(request.url).pathname : null,
    operation: error?.operation || null,
    error: getD1ErrorMessage(error?.cause || error)
  }));
  return json2({
    code: "DATABASE_WRITE_OUTCOME_UNKNOWN",
    error: "A confirma\xE7\xE3o da grava\xE7\xE3o foi interrompida. Atualize a tela para conferir o resultado antes de repetir.",
    retryable: false,
    requestId
  }, 503, {
    "Cache-Control": "no-store",
    "X-Request-ID": requestId
  });
}
__name(databaseWriteOutcomeUnknownResponse, "databaseWriteOutcomeUnknownResponse");
function databaseUnavailableResponse(error, request = null) {
  const requestId = getRequestId(request);
  const retryable = isRetryableD1Error(error);
  console.error(JSON.stringify({
    message: "d1 temporarily unavailable",
    requestId,
    method: request?.method || null,
    path: request?.url ? new URL(request.url).pathname : null,
    error: getD1ErrorMessage(error)
  }));
  return json2({
    code: "DATABASE_TEMPORARILY_UNAVAILABLE",
    error: "O banco de dados oscilou por alguns instantes. Tente novamente.",
    retryable,
    requestId
  }, 503, {
    "Cache-Control": "no-store",
    ...retryable ? { "Retry-After": "1" } : {},
    "X-Request-ID": requestId
  });
}
__name(databaseUnavailableResponse, "databaseUnavailableResponse");
function getD1LedgerConflictCode(error) {
  return getD1ErrorMessage(error).match(/\b(D1_(?:LEDGER|BALANCE)_[A-Z0-9_]+)\b/)?.[1] || null;
}
__name(getD1LedgerConflictCode, "getD1LedgerConflictCode");
function databaseIntegrityConflictResponse(error, request = null) {
  const requestId = getRequestId(request);
  const code = getD1LedgerConflictCode(error) || "D1_LEDGER_CONFLICT";
  console.warn(JSON.stringify({
    message: "d1 ledger invariant prevented an unsafe write",
    requestId,
    method: request?.method || null,
    path: request?.url ? new URL(request.url).pathname : null,
    code
  }));
  return json2({
    code,
    error: "O estoque ou o evento mudou durante a opera\xE7\xE3o. Atualize a tela e tente novamente.",
    retryable: false,
    requestId
  }, 409, {
    "Cache-Control": "no-store",
    "X-Request-ID": requestId
  });
}
__name(databaseIntegrityConflictResponse, "databaseIntegrityConflictResponse");
function parseCookies(cookieHeader) {
  return cookieHeader.split(";").map((part) => part.trim()).filter(Boolean).reduce((acc, part) => {
    const index = part.indexOf("=");
    if (index === -1) return acc;
    const key = part.slice(0, index);
    const value = part.slice(index + 1);
    acc[key] = value;
    return acc;
  }, {});
}
__name(parseCookies, "parseCookies");
function toBase64Url(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(toBase64Url, "toBase64Url");
function toSqliteDate(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
__name(toSqliteDate, "toSqliteDate");
function cleanText2(value, maxLength = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
__name(cleanText2, "cleanText");
function parseMoneyValue2(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const normalized = text.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return Number.parseFloat(normalized);
}
__name(parseMoneyValue2, "parseMoneyValue");
function roundMoney2(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}
__name(roundMoney2, "roundMoney");
function parseBooleanFlag2(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "true", "sim", "yes", "on"].includes(normalized);
}
__name(parseBooleanFlag2, "parseBooleanFlag");
function parseIsoDateKey2(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return "";
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
__name(parseIsoDateKey2, "parseIsoDateKey");
function createDateRange2(startValue, endValue = startValue) {
  const start = parseIsoDateKey2(startValue);
  const end = parseIsoDateKey2(endValue || startValue);
  if (!start || !end || end < start) return null;
  const formatLabel = /* @__PURE__ */ __name((dateKey) => {
    const [year, month, day] = dateKey.split("-");
    return `${day}/${month}/${year}`;
  }, "formatLabel");
  return {
    start,
    end,
    startLabel: formatLabel(start),
    endLabel: formatLabel(end)
  };
}
__name(createDateRange2, "createDateRange");
function getEventDateRange2(event) {
  if (!event) return null;
  const eventType = String(event.event_type || event.eventType || "event").trim().toLowerCase();
  if (eventType === "rental") {
    const start = event.withdrawal_date || event.withdrawalDate || event.date;
    const end = event.return_date || event.returnDate || start;
    return createDateRange2(start, end);
  }
  return createDateRange2(event.date, event.end_date || event.endDate || event.date);
}
__name(getEventDateRange2, "getEventDateRange");
function operatorInputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
__name(operatorInputError, "operatorInputError");
function onlyDigits(value, maxLength) {
  return String(value || "").replace(/\D/g, "").slice(0, maxLength);
}
__name(onlyDigits, "onlyDigits");
function formatCpf(value) {
  const digits = onlyDigits(value, 11);
  if (digits.length !== 11) return "";
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
__name(formatCpf, "formatCpf");
function formatCellPhone(value) {
  const digits = onlyDigits(value, 11);
  if (digits.length !== 11) return "";
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
__name(formatCellPhone, "formatCellPhone");
function normalizeOperatorPayload(body = {}, options = {}) {
  const fullName = cleanText2(body.fullName ?? body.full_name, 160);
  const motherName = cleanText2(body.motherName ?? body.mother_name, 160);
  const cpf = formatCpf(body.cpf);
  const rg = cleanText2(body.rg, 30);
  const birthDate = parseIsoDateKey2(body.birthDate ?? body.birth_date);
  const address = cleanText2(body.address, 300);
  const email = cleanText2(body.email, 160);
  const phone = formatCellPhone(body.phone);
  const area = cleanText2(body.area, 120);
  const hasVehicle = parseBooleanFlag2(body.hasVehicle ?? body.has_vehicle);
  const pix = cleanText2(body.pix, 160);
  const agency = cleanText2(body.agency, 80);
  const photo = String(body.photo || "").trim();
  const cacheValue = roundMoney2(parseMoneyValue2(body.cacheValue ?? body.cache_value));
  if (!fullName) throw operatorInputError("Nome completo \xE9 obrigat\xF3rio");
  if (!motherName) throw operatorInputError("Nome da m\xE3e \xE9 obrigat\xF3rio");
  if (!cpf) throw operatorInputError("CPF deve ter 11 n\xFAmeros");
  if (!birthDate) throw operatorInputError("Data de nascimento inv\xE1lida");
  if (!address) throw operatorInputError("Endere\xE7o \xE9 obrigat\xF3rio");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw operatorInputError("E-mail inv\xE1lido");
  }
  if (!phone) throw operatorInputError("N\xFAmero de celular deve ter 11 n\xFAmeros com DDD");
  if (!area) throw operatorInputError("\xC1rea \xE9 obrigat\xF3ria");
  if (!Number.isFinite(cacheValue) || cacheValue < 0) {
    throw operatorInputError("Valor cach\xEA inv\xE1lido");
  }
  if (!photo && options.requirePhoto) {
    throw operatorInputError("Foto \xE9 obrigat\xF3ria");
  }
  if (photo && (photo.length > OPERATOR_PHOTO_MAX_LENGTH || !OPERATOR_PHOTO_PATTERN.test(photo))) {
    throw operatorInputError("Foto inv\xE1lida ou muito grande");
  }
  return {
    fullName,
    motherName,
    cpf,
    rg,
    birthDate,
    address,
    email,
    phone,
    area,
    hasVehicle,
    pix,
    agency,
    photo,
    cacheValue
  };
}
__name(normalizeOperatorPayload, "normalizeOperatorPayload");
function serializeOperator2(row = {}) {
  return {
    id: row.id,
    fullName: row.fullName ?? row.full_name ?? "",
    motherName: row.motherName ?? row.mother_name ?? "",
    cpf: row.cpf || "",
    rg: row.rg || "",
    birthDate: row.birthDate ?? row.birth_date ?? "",
    address: row.address || "",
    email: row.email || "",
    phone: row.phone || "",
    area: row.area || "",
    hasVehicle: Number(row.hasVehicle ?? row.has_vehicle ?? 0) === 1,
    pix: row.pix || "",
    agency: row.agency || "",
    photo: row.photo || "",
    cacheValue: roundMoney2(row.cacheValue ?? row.cache_value ?? 0),
    createdByUsername: row.createdByUsername ?? row.created_by_username ?? "",
    createdAt: row.createdAt ?? row.created_at ?? "",
    updatedAt: row.updatedAt ?? row.updated_at ?? ""
  };
}
__name(serializeOperator2, "serializeOperator");
function isMaintenanceStatus(status) {
  return String(status || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes("manut");
}
__name(isMaintenanceStatus, "isMaintenanceStatus");
function normalizeEquipmentBarcode(value) {
  const barcode = String(value || "").trim();
  return /^\d{1,4}$/.test(barcode) ? barcode.padStart(4, "0") : barcode;
}
__name(normalizeEquipmentBarcode, "normalizeEquipmentBarcode");
function duplicateEquipmentMessage(equipment) {
  const equipmentName = equipment?.name ? ` (${equipment.name})` : "";
  return `Ja existe um equipamento cadastrado com esse patrimonio/codigo de barras${equipmentName}.`;
}
__name(duplicateEquipmentMessage, "duplicateEquipmentMessage");
function handleDatabaseError(error, duplicateMessage) {
  if (isD1WriteOutcomeUnknownError(error)) {
    return databaseWriteOutcomeUnknownResponse(error);
  }
  const message = String(error?.message || error || "");
  if (message.toLowerCase().includes("unique")) {
    return json2({ error: duplicateMessage }, 409);
  }
  if (isD1UnavailableError(error)) {
    return databaseUnavailableResponse(error);
  }
  if (getD1LedgerConflictCode(error)) {
    return databaseIntegrityConflictResponse(error);
  }
  console.error(JSON.stringify({
    message: "database operation failed",
    error: getD1ErrorMessage(error)
  }));
  return json2({ error: message || "Erro no banco de dados" }, 500);
}
__name(handleDatabaseError, "handleDatabaseError");
export {
  worker_default as default
};
/*! Bundled license information:

bcryptjs/dist/bcrypt.js:
  (**
   * @license bcrypt.js (c) 2013 Daniel Wirtz <dcode@dcode.io>
   * Released under the Apache License, Version 2.0
   * see: https://github.com/dcodeIO/bcrypt.js for details
   *)
*/
//# sourceMappingURL=worker.js.map
