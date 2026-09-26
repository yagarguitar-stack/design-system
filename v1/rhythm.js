/* yagarguitar-stack 共通デザイン v1 — リズム譜（rhythm.js）
   1本線の打楽器譜を描き、clock.js で「譜面どおりに鳴らして、縦の線を流す」までを受け持つ。
   記号は五線譜（notation.js）と同じ Bravura の字形を、図形データとして内蔵している（フォントの読み込み待ちなし）。
   Bravura は SIL Open Font License 1.1。

   長さは notation.js と同じ：4分音符＝1680（DS.rhythm.T.QUARTER）

   例：
     var v = DS.rhythm.render(el, '4/4 q 8 8 qr 16 16 16 16 | 3(8 8 8) 8. 16 8r 8~ q');
     var p = DS.rhythm.play(v, {bpm:90, countIn:1});      // 鳴らして縦の線を流す。p.stop() で止める
     btn.onpointerdown = function(e){ var r = p.judge(e); };  // タップのずれ（ms、＋が遅い）

   書き方（文字で渡すとき）
     長さ   w＝全 h＝2分 q＝4分 8 16 32、後ろに . で付点（.. で複付点）
     休符   長さの後ろに r（例 qr 8.r）
     タイ   後ろに ~（次の音とつなぐ）　アクセント 後ろに >
     連符   3(8 8 8)＝3連、5(16 16 16 16 16)、6(16 …)。3:2(…) のように書けば比も指定できる
     拍子   4/4・6/8・7/8:2+2+3 のように小節の頭に書く（書かなければ前の小節と同じ）
     小節   | で区切る
*/
(function(){
  var G=window, DS=G.DS=G.DS||{};
  var GL={"nhBlack":["M97 125C186 125 295 43 295 -42C295 -93 255 -125 198 -125C88 -125 0 -44 0 42C0 94 43 125 97 125Z",295],"nhHalf":["M97 125C262 125 295 -9 295 -42C295 -93 254 -125 196 -125C47 -125 0 -10 0 42C0 95 42 125 97 125ZM173 46C128 76 97 87 75 87C54 87 42 76 35 64C32 58 29 51 29 44C29 22 51 -5 120 -45C170 -74 201 -84 221 -84C240 -84 251 -75 258 -63C261 -57 264 -51 264 -44C264 -24 243 0 173 46Z",295],"nhWhole":["M216 -125C83 -125 0 -70 0 -2C0 65 57 125 206 125C370 125 422 68 422 -2C422 -73 309 -125 216 -125ZM111 -63C122 -98 159 -103 190 -103C259 -103 314 -29 314 31C314 38 313 44 312 50C307 75 293 92 268 98C258 101 247 102 237 102C228 102 220 101 211 98C194 93 178 84 164 72C156 65 149 58 143 50C123 27 108 -7 108 -39C108 -47 109 -55 111 -63Z",422],"dot":["M100 0C100 -28 78 -50 50 -50C22 -50 0 -28 0 0C0 28 22 50 50 50C78 50 100 28 100 0Z",100],"flag8":["M238 790C238 790 264 695 264 617C264 492 212 374 149 274C98 195 56 109 40 13C37 -3 29 -9 19 -9C8 -9 0 -6 0 6V245C66 257 161 393 197 478C212 512 221 569 221 628C221 673 214 720 197 765C195 771 194 776 194 780C194 796 204 805 210 809C211 810 213 810 215 810C222 810 234 804 238 790Z",264],"flag16":["M272 796C276 791 279 734 279 686V664C279 622 268 581 250 544C250 541 249 539 249 535C249 533 249 531 250 528C253 522 275 462 275 401C275 388 274 377 272 365C262 297 236 269 164 191C110 133 54 117 37 11C35 0 23 -2 17 -2C11 -2 0 1 0 8V396H5C67 398 138 400 207 540C230 588 239 637 239 689C239 718 236 748 231 778C230 782 230 784 230 787C230 801 237 809 244 811C247 812 249 813 252 813C259 813 266 809 272 796ZM209 459C193 434 176 414 155 390C108 336 62 312 41 230C40 229 40 228 40 227C40 223 46 217 54 217H62C123 217 177 273 210 322C228 348 237 379 237 411C237 418 237 424 236 431C234 439 234 449 229 457C228 460 221 463 216 463C213 463 211 462 209 459Z",279],"flag32":["M260 673C258 634 249 596 234 560C233 558 233 556 233 553C233 551 233 549 234 547C236 540 257 485 257 428C257 416 256 405 254 393C250 370 244 352 236 335C245 309 256 268 256 229C256 219 256 210 254 201C243 140 220 113 153 40C103 -14 49 -30 32 -130C31 -139 24 -149 14 -149C8 -149 0 -144 0 -137V423H5C63 425 129 427 193 557C215 601 224 646 224 694C224 722 221 750 216 779C216 782 215 784 215 786C215 798 221 807 228 810C230 811 232 812 234 812C240 812 247 807 254 796C257 790 261 744 261 701C261 691 260 682 260 673ZM208 181C219 201 223 216 223 229C223 237 221 243 220 250C218 260 213 277 208 294C194 276 176 257 153 232C104 178 55 161 39 64C94 64 153 88 208 181ZM219 456C217 464 217 472 214 479C213 482 208 485 203 485C200 485 197 484 196 481C181 459 167 442 150 422L145 417C102 366 61 344 39 271C37 264 42 255 51 255C114 255 165 306 196 352C212 376 221 403 221 432C221 440 220 448 219 456Z",262],"rWhole":["M282 109V17C282 2 270 -9 256 -9H26C11 -9 0 2 0 17V109C0 123 11 135 26 135H256C270 135 282 123 282 109Z",283],"rHalf":["M282 -24V-116C282 -131 270 -142 256 -142H26C11 -142 0 -131 0 -116V-24C0 -10 11 2 26 2H256C270 2 282 -10 282 -24Z",283],"rQuarter":["M78 38C94 58 108 77 121 98C123 102 127 110 127 112C127 113 127 115 126 116C124 120 120 121 115 121C111 121 103 119 99 118C94 118 88 115 83 115C40 115 1 158 1 211C1 261 44 310 117 366C125 372 135 375 143 375C150 375 157 373 158 369C159 366 160 364 160 362C160 353 152 345 144 338C131 338 120 311 118 302C115 294 114 285 114 276C114 245 129 210 161 204C166 203 171 203 177 203C206 203 239 214 255 220C256 220 257 221 258 221C261 222 263 222 265 222C268 222 270 221 270 218C270 206 244 173 233 161C195 115 164 78 164 22C164 18 165 13 165 9C169 -49 205 -97 231 -138C234 -143 235 -148 235 -153C235 -163 231 -172 231 -172C231 -172 83 -348 66 -365C61 -370 54 -373 48 -373C38 -373 28 -366 28 -352C28 -347 29 -342 32 -336C36 -325 93 -274 93 -202C93 -165 78 -122 33 -75C23 -65 19 -54 19 -46C19 -32 29 -22 29 -22Z",270],"r8":["M134 -107C134 -144 104 -174 67 -174C30 -174 0 -144 0 -107C0 -86 12 -68 27 -56C36 -50 45 -45 55 -43C63 -41 72 -39 81 -39C95 -39 109 -42 120 -46C134 -50 143 -54 156 -61C158 -62 160 -62 161 -62C165 -62 166 -58 166 -53C166 -50 166 -46 165 -42C162 -27 90 172 72 238C72 250 95 251 101 251C112 251 126 249 136 241C139 239 237 -112 237 -112C241 -130 246 -146 247 -151C247 -161 237 -166 235 -167C233 -167 230 -167 224 -163C217 -157 167 -97 134 -97Z",250],"r16":["M208 -111C208 -149 178 -179 140 -179C103 -179 72 -149 72 -111C72 -91 84 -72 100 -60C108 -54 118 -49 128 -46C135 -44 143 -43 152 -43C166 -43 182 -46 194 -50C208 -54 217 -58 230 -65C233 -66 235 -67 237 -67C240 -67 242 -65 242 -60C242 -57 241 -52 239 -45C237 -37 193 101 184 120C176 139 149 151 135 151C136 147 136 144 136 141C136 103 105 73 68 73C30 73 0 103 0 141C0 161 12 180 28 192C36 198 45 203 55 206C63 208 71 209 80 209C94 209 110 206 122 202C136 198 142 195 155 188C157 188 159 190 159 193C159 194 158 195 158 196L63 479C63 480 62 481 62 482C62 490 71 500 93 500C122 500 127 488 131 477L247 96C273 11 292 -56 292 -56C292 -56 317 -144 319 -157C319 -159 320 -160 320 -161C320 -167 312 -171 310 -172C305 -172 302 -170 299 -168C292 -162 242 -102 208 -101Z",320],"r32":["M353 -419C348 -419 345 -417 342 -415C335 -410 285 -349 251 -349V-358C251 -396 221 -426 183 -426C146 -426 115 -396 115 -358C115 -338 127 -320 143 -308C151 -301 161 -297 171 -294C179 -292 187 -290 197 -290C211 -290 226 -293 238 -297C252 -302 260 -305 273 -312C274 -313 276 -313 277 -313C284 -313 288 -303 288 -297C288 -296 287 -294 287 -293L248 -133C243 -117 210 -97 194 -97C195 -100 195 -103 195 -106C195 -144 164 -174 127 -174C89 -174 59 -144 59 -106C59 -86 71 -68 87 -56C95 -49 104 -45 114 -42C122 -40 131 -38 141 -38C155 -38 170 -41 181 -45C195 -50 203 -53 216 -60C217 -61 218 -61 219 -61C224 -61 226 -53 226 -48L186 116C181 137 150 150 135 151C136 147 136 144 136 141C136 103 106 73 68 73C31 73 0 103 0 141C0 161 12 180 28 192C36 198 46 203 56 206C63 208 71 209 80 209C94 209 110 206 122 202C136 198 145 194 158 187C159 186 160 186 161 186C164 186 167 189 167 192C167 196 98 471 96 478C95 480 95 482 95 484C95 492 101 500 122 500C154 500 157 490 161 479C164 467 336 -303 336 -303C336 -303 360 -392 362 -404C362 -406 363 -407 363 -408C363 -417 355 -419 353 -419Z",363],"accent":["M326 -105C339 -108 339 -115 339 -123C339 -131 339 -137 326 -141L26 -243C22 -244 18 -245 17 -245C8 -245 5 -239 2 -231C1 -227 0 -224 0 -221C0 -216 3 -211 14 -207C14 -207 230 -134 240 -130C245 -129 247 -126 247 -123C247 -120 245 -118 239 -116C228 -113 14 -40 14 -40C3 -35 0 -30 0 -25C0 -22 1 -19 2 -16C5 -9 9 -1 16 -1C17 -1 19 -1 20 -2Z",339],"ts0":["M450 0C450 -139 354 -251 235 -251C116 -251 20 -139 20 0C20 138 116 250 235 250C354 250 450 138 450 0ZM235 -220C276 -220 310 -125 310 -7C310 110 276 205 235 205C193 205 160 110 160 -7C160 -125 193 -220 235 -220Z",470],"tu0":["M207 -375C122 -375 49 -309 14 -196C5 -168 0 -138 0 -111C0 -45 30 8 110 8C195 8 268 -58 304 -171C313 -199 318 -229 318 -256C318 -321 288 -375 207 -375ZM208 -349C232 -349 240 -326 240 -295C240 -262 230 -219 219 -184C194 -104 154 -18 109 -18C86 -18 78 -40 78 -71C78 -104 88 -148 99 -183C124 -262 164 -349 208 -349Z",319],"ts1":["M24 -13C24 -13 20 -7 20 0C20 5 23 11 31 14C35 15 39 16 40 16C50 16 54 7 54 7C54 7 97 -62 108 -81C112 -88 116 -91 118 -91C122 -91 124 -83 124 -77V181C124 204 101 219 80 219C73 219 63 222 63 234C63 245 72 250 85 250H298C314 250 314 234 314 234C314 234 314 219 299 219C285 219 267 201 267 184V-228C267 -244 261 -250 247 -251C233 -251 208 -247 195 -247C176 -247 158 -248 143 -250C141 -250 139 -251 138 -251C128 -251 124 -241 120 -232Z",334],"tu1":["M60 -244C55 -237 52 -232 52 -227C52 -220 59 -212 68 -212C76 -212 80 -216 86 -223L123 -263C128 -270 132 -272 136 -272C139 -272 141 -271 141 -266C141 -264 140 -259 139 -254L71 -41C68 -34 68 -32 59 -31L24 -28C15 -27 10 -22 10 -14C10 -6 15 0 25 0H193C204 0 208 -6 208 -14C208 -22 204 -27 195 -28L161 -31C153 -32 155 -36 157 -45L254 -351C255 -356 256 -361 256 -362C256 -368 253 -372 247 -372C236 -372 223 -363 213 -363C200 -363 194 -372 182 -372C175 -372 171 -369 166 -364Z",246],"ts2":["M421 91C421 79 416 77 409 77C401 77 398 81 396 87C396 88 395 89 395 90C385 114 377 133 356 133C351 133 346 132 339 130C326 125 319 124 309 119C289 111 242 95 201 95C188 95 175 97 164 101C186 65 271 35 293 29C308 25 350 17 383 -10C407 -29 426 -58 426 -102C426 -149 406 -183 380 -205C329 -248 251 -254 229 -254C202 -254 168 -253 142 -247C107 -240 72 -219 48 -191C31 -170 20 -145 20 -118C20 -104 23 -90 29 -75C44 -44 75 -20 111 -20C172 -20 181 -83 181 -108C181 -168 112 -171 112 -191C114 -205 132 -229 191 -229C280 -229 281 -162 281 -133C281 -95 269 -60 247 -31C211 17 183 41 134 71C79 106 40 155 23 218C23 220 22 222 22 224C22 235 29 248 40 255C43 257 46 257 48 257C70 257 82 196 141 196C181 196 196 250 285 250C328 250 405 246 421 91Z",446],"tu2":["M210 -375C129 -375 77 -320 77 -263C77 -241 89 -220 120 -220C147 -220 167 -244 167 -271C167 -285 161 -295 155 -301C149 -307 144 -311 144 -319C144 -331 163 -347 197 -347C224 -347 249 -339 249 -304C249 -257 227 -207 149 -176C65 -142 30 -92 13 -28C11 -20 10 -16 10 -12C10 -3 16 3 26 3C36 3 41 -2 46 -15C51 -28 57 -37 72 -37C107 -37 133 6 199 6C250 6 273 -26 291 -82C294 -89 295 -92 295 -96C295 -104 287 -108 280 -108C274 -108 270 -105 265 -97C253 -81 240 -75 222 -75C193 -75 169 -93 137 -93C122 -93 109 -91 97 -86C89 -83 85 -80 81 -80C74 -80 77 -88 85 -97C107 -122 141 -137 180 -146C259 -164 329 -201 329 -289C329 -342 285 -375 210 -375Z",319],"ts3":["M213 -248C208 -248 203 -249 198 -249C112 -249 26 -192 26 -139C26 -106 45 -62 107 -58H112C156 -58 178 -90 178 -123V-131C175 -168 150 -170 145 -172C140 -174 125 -172 125 -186V-190C127 -207 158 -215 167 -215C252 -215 260 -162 260 -138V-131C260 -57 201 -28 138 -25C128 -24 114 -19 114 -8C114 4 131 4 139 4C254 4 263 82 263 95C263 201 209 213 187 213C183 213 179 212 178 212C170 211 151 211 150 196V191C150 169 172 154 173 125C173 115 172 104 168 94C157 69 128 53 101 53C97 53 94 53 90 54C73 57 54 67 42 80C25 95 20 119 20 141C22 219 93 249 191 251H200C299 251 401 200 401 112V105C400 91 398 77 392 64C388 54 381 44 373 35C367 27 359 20 349 14L328 2L295 -7C290 -8 287 -8 285 -12C284 -14 284 -15 284 -17C284 -21 285 -25 288 -26C299 -29 310 -30 319 -35C334 -42 347 -49 358 -62C374 -80 380 -103 380 -126C380 -218 255 -245 213 -248Z",421],"tu3":["M122 -207C109 -207 102 -201 102 -192C102 -183 109 -177 122 -177H132C169 -177 187 -155 187 -123C187 -79 156 -18 95 -18C75 -18 59 -26 59 -36C59 -42 64 -44 72 -48C83 -53 97 -65 97 -91C97 -115 80 -127 59 -127C31 -127 10 -102 10 -69C10 -29 42 8 113 8C198 8 268 -43 268 -122C268 -147 255 -171 229 -184C222 -187 218 -188 218 -193C218 -196 222 -198 230 -202C272 -219 306 -251 306 -291C306 -343 256 -375 195 -375C132 -375 80 -342 78 -288V-286C78 -261 94 -245 116 -245C141 -245 161 -265 161 -292C161 -303 157 -311 152 -317C145 -323 140 -327 140 -330C140 -337 152 -344 173 -344C212 -344 225 -320 225 -298C225 -245 191 -207 133 -207Z",296],"ts4":["M362 74V-140C362 -148 361 -157 350 -157C341 -157 336 -155 330 -148L235 -33C231 -28 226 -22 226 -10V74H91C171 6 331 -221 334 -232C334 -234 335 -235 335 -237C335 -245 328 -251 320 -251C311 -251 270 -249 252 -249C234 -249 189 -251 181 -251C172 -251 158 -248 158 -232C158 -108 60 31 30 73L24 81C24 82 23 83 23 84C21 88 20 92 20 95C20 105 28 112 40 112H226V175C226 202 204 210 186 210C170 210 163 219 163 229C163 239 167 250 182 250H395C405 250 415 243 415 229C415 215 403 209 393 209C383 209 362 203 362 171V112H435C445 112 450 105 450 93C450 81 446 74 435 74Z",470],"tu4":["M270 -131C266 -131 264 -133 265 -139L306 -269C308 -277 310 -285 310 -288C310 -295 304 -297 296 -297C286 -297 281 -293 273 -284L209 -215C202 -207 200 -203 198 -196L180 -139C178 -134 177 -131 170 -131H80C73 -131 72 -134 72 -136C72 -138 73 -140 77 -143C155 -205 241 -289 289 -352C294 -358 294 -361 294 -364C294 -369 291 -372 283 -372C268 -372 254 -363 236 -363C217 -363 201 -372 188 -372C180 -372 177 -367 175 -361C166 -330 146 -286 120 -249C91 -207 59 -172 20 -133C14 -127 10 -123 10 -116C10 -108 16 -103 28 -103H164C168 -103 170 -101 169 -96L152 -41C149 -34 149 -32 140 -31L105 -28C96 -27 91 -22 91 -14C91 -6 96 0 106 0H274C285 0 289 -6 289 -14C289 -22 285 -27 276 -28L242 -31C234 -32 236 -36 238 -45L254 -95C255 -100 257 -103 264 -103H298C307 -103 313 -109 313 -117C313 -126 307 -131 299 -131Z",303],"ts5":["M76 -59C76 -59 80 -115 81 -124C82 -132 87 -137 96 -137H100C110 -135 157 -128 198 -128C337 -128 342 -208 342 -224C342 -237 339 -245 328 -245C315 -245 237 -236 205 -236C173 -236 87 -244 70 -246C52 -246 47 -237 46 -229L35 -7V-5C35 8 45 10 55 10C65 10 66 1 77 -10C87 -20 111 -43 145 -43C179 -43 248 -24 248 87C248 197 189 211 163 211C155 211 147 211 140 208C135 205 129 201 128 194C128 187 135 183 140 180C163 166 178 141 178 113C178 69 143 35 100 35C46 35 24 74 21 109C20 115 20 121 20 127C20 210 74 251 197 251C317 251 383 177 383 87C383 -4 309 -78 218 -78C160 -78 117 -68 85 -49C83 -48 81 -48 80 -48C76 -48 76 -52 76 -55Z",403],"tu5":["M55 -192C52 -182 51 -179 51 -173C51 -164 58 -158 67 -158C74 -158 79 -161 86 -168C95 -177 115 -198 146 -198C180 -198 192 -176 192 -147C192 -99 160 -18 95 -18C75 -18 59 -26 59 -36C59 -42 64 -44 72 -48C83 -53 97 -65 97 -91C97 -115 79 -127 58 -127C31 -127 10 -102 10 -69C10 -29 42 8 113 8C205 8 273 -55 273 -149C273 -207 233 -231 168 -231C148 -231 134 -228 121 -224C106 -220 104 -226 107 -236L122 -281C126 -291 130 -291 140 -289C151 -288 166 -286 179 -286C237 -286 283 -313 314 -342C323 -351 327 -357 327 -364C327 -369 323 -373 318 -373C318 -373 307 -370 293 -366C273 -360 248 -357 219 -357C191 -357 171 -361 159 -365C145 -369 139 -370 132 -370C121 -370 114 -365 110 -353Z",317],"ts6":["M260 -100C272 -88 289 -83 305 -83C313 -83 322 -85 330 -87C361 -95 385 -127 385 -159C385 -163 385 -166 384 -170C379 -203 351 -227 321 -238C297 -248 268 -251 242 -251C166 -250 95 -213 59 -145C37 -103 20 -50 20 -3V1C21 47 29 99 51 139C72 177 106 218 145 235C170 246 200 249 225 249C270 249 320 242 356 213C391 185 414 140 414 95C414 39 384 5 352 -19C325 -39 294 -50 263 -50C231 -50 198 -38 172 -15C170 -13 168 -13 166 -13C160 -13 157 -21 157 -37C160 -222 219 -227 240 -227C260 -227 273 -222 273 -212C273 -198 254 -186 248 -174C243 -165 241 -155 241 -145C241 -130 246 -115 256 -104C257 -102 259 -101 260 -100ZM222 -2C254 -2 281 48 281 110C281 172 254 222 222 222C190 222 164 172 164 110C164 48 190 -2 222 -2Z",434],"tu6":["M229 -350H233C250 -350 264 -345 264 -339C264 -335 255 -331 250 -329C235 -322 223 -307 223 -286C223 -262 243 -248 265 -248C294 -248 314 -270 314 -304C314 -345 278 -375 219 -375C133 -375 64 -320 28 -209C17 -175 10 -141 10 -111C10 -43 43 8 128 8C201 8 283 -42 283 -144C283 -192 252 -230 194 -230C167 -230 143 -224 123 -209C114 -203 105 -204 111 -223C132 -282 170 -347 229 -350ZM165 -194C194 -194 202 -174 202 -145C202 -75 164 -18 125 -18C93 -18 84 -42 84 -67C84 -79 86 -91 88 -102C98 -154 130 -194 165 -194Z",304],"ts7":["M421 -204C421 -231 421 -244 404 -244C403 -244 387 -240 383 -233C376 -221 362 -164 337 -164C312 -164 265 -249 182 -249C124 -249 109 -226 95 -213C81 -200 75 -196 68 -195C60 -195 47 -209 42 -219C40 -223 35 -226 30 -226C25 -226 20 -223 20 -214V-49C20 -49 21 -33 31 -33C39 -33 42 -42 46 -53C56 -78 69 -136 114 -136C154 -136 202 -61 260 -61C288 -61 302 -76 310 -82C313 -84 317 -86 319 -86C323 -86 325 -83 326 -77C326 -49 249 7 189 78C151 122 120 180 120 219C120 240 120 250 139 250C157 250 179 241 204 241C229 241 276 250 286 250C296 250 302 242 302 213C302 46 421 -97 421 -200Z",441],"tu7":["M32 -249C31 -246 30 -243 30 -241C30 -234 34 -231 42 -231C51 -231 57 -233 60 -244C69 -271 81 -292 105 -292C133 -292 166 -273 203 -273C223 -273 245 -280 265 -293C273 -298 278 -292 273 -285C244 -242 208 -219 166 -185C105 -137 67 -77 47 -13C46 -11 45 -7 45 -4C45 1 48 4 54 4C69 4 84 -5 100 -5C115 -5 128 4 143 4C152 4 155 0 156 -7C171 -70 186 -127 241 -190C275 -229 310 -274 331 -343C332 -348 333 -353 333 -358C333 -367 326 -369 318 -369C306 -369 302 -366 298 -356C292 -339 282 -331 267 -331C234 -331 215 -372 166 -372C144 -372 125 -361 109 -347C102 -340 98 -336 96 -336C95 -336 93 -337 93 -340C93 -346 97 -352 97 -360C97 -366 92 -369 84 -369C75 -369 70 -367 66 -357Z",303],"ts8":["M334 -36C370 -59 394 -92 394 -142C394 -244 247 -259 220 -259C104 -259 25 -206 25 -122C25 -53 64 -16 112 11C60 36 20 69 20 132C20 219 110 259 209 259C309 259 416 216 416 81C416 21 381 -12 334 -36ZM282 -59C202 -87 117 -104 117 -167C117 -209 174 -230 218 -230C250 -230 335 -214 335 -144C335 -104 315 -78 282 -59ZM205 226C138 226 77 192 77 127C77 87 112 50 156 33C229 65 303 86 303 152C303 192 272 226 205 226Z",436],"tu8":["M211 -375C128 -375 71 -335 71 -266C71 -242 77 -222 90 -207C94 -202 97 -198 97 -194C97 -191 93 -187 82 -183C30 -162 10 -126 10 -87C10 -34 49 8 136 8C215 8 284 -33 284 -107C284 -137 276 -158 258 -178C252 -184 248 -189 248 -192C248 -196 252 -200 262 -205C306 -228 323 -261 323 -291C323 -337 290 -375 211 -375ZM209 -351C248 -351 261 -325 261 -298C261 -271 249 -243 222 -224C215 -220 210 -219 198 -228C160 -256 148 -271 148 -294C148 -330 173 -351 209 -351ZM119 -162C127 -167 131 -166 142 -157C194 -117 207 -105 207 -81C207 -40 176 -16 138 -16C89 -16 73 -49 73 -79C73 -104 85 -141 119 -162Z",313],"ts9":["M174 98C162 86 145 81 129 81C121 81 112 83 104 85C73 93 49 125 49 157C49 161 49 164 50 168C55 201 83 225 113 236C137 246 166 249 192 249C268 248 339 211 375 143C397 101 414 48 414 1V-3C413 -49 405 -101 383 -141C362 -179 328 -220 289 -237C264 -248 234 -251 209 -251C164 -251 114 -244 78 -215C43 -187 20 -142 20 -97C20 -41 50 -7 82 17C109 37 140 48 171 48C203 48 236 36 262 13C264 11 266 11 268 11C274 11 277 19 277 35C274 220 215 225 194 225C174 225 161 220 161 210C161 196 180 184 186 172C191 163 193 153 193 143C193 128 188 113 178 102C177 100 175 99 174 98ZM212 0C180 0 153 -50 153 -112C153 -174 180 -224 212 -224C244 -224 270 -174 270 -112C270 -50 244 0 212 0Z",434],"tu9":["M95 -17H91C74 -17 60 -22 60 -28C60 -32 69 -36 74 -38C89 -45 101 -60 101 -81C101 -105 81 -119 59 -119C30 -119 10 -97 10 -63C10 -22 46 8 105 8C191 8 260 -47 296 -158C307 -192 314 -226 314 -256C314 -324 281 -375 196 -375C123 -375 41 -325 41 -223C41 -175 72 -137 130 -137C157 -137 181 -143 201 -158C210 -164 219 -163 213 -144C192 -85 154 -20 95 -17ZM159 -173C130 -173 122 -193 122 -222C122 -292 160 -349 199 -349C231 -349 240 -325 240 -300C240 -288 238 -276 236 -265C226 -213 194 -173 159 -173Z",304]};
  var Q=1680, H=Q*2, W=Q*4, E=Q/2, S=Q/4, T32=Q/8;
  var NS='http://www.w3.org/2000/svg';
  var VALS=[[W,'w'],[H,'h'],[Q,'q'],[E,'8'],[S,'16'],[T32,'32']];
  var LEVEL={'8':1,'16':2,'32':3};

  function near(a,b){return Math.abs(a-b)<0.51;}
  /* 見た目の長さ → 記号と付点 */
  function shape(len){
    for(var i=0;i<VALS.length;i++){var v=VALS[i][0];
      if(near(len,v))return {b:VALS[i][1],dots:0,unit:v};
      if(near(len,v*1.5))return {b:VALS[i][1],dots:1,unit:v};
      if(near(len,v*1.75))return {b:VALS[i][1],dots:2,unit:v};}
    return null;
  }
  function defIn(n){var p=1;while(p*2<n)p*=2;return p;}   // 3→2・5→4・6→4・7→4
  function barLen(ts){return ts[0]*W/ts[1];}
  function beatUnit(ts){return W/ts[1];}
  /* 連桁のまとまり（拍）。6/8 などは付点4分ずつ、指定があればそのとおり */
  function beatGroups(ts,groups){
    var u=beatUnit(ts),a=[],i;
    if(groups)return groups.map(function(n){return n*u;});
    if(ts[1]>=8&&ts[0]%3===0&&ts[0]>3){for(i=0;i<ts[0]/3;i++)a.push(u*3);return a;}
    for(i=0;i<ts[0];i++)a.push(u);return a;
  }

  /* ───────── 文字の書き方を読む ───────── */
  function parse(str){
    var errors=[],bars=[],ts=[4,4],groups=null,cur=null;
    var toks=String(str).replace(/\|/g,' | ').replace(/\(/g,' ( ').replace(/\)/g,' ) ').trim().split(/\s+/);
    var tu=null;
    function bar(){if(!cur){cur={ts:ts.slice(),groups:groups,notes:[]};bars.push(cur);}return cur;}
    for(var i=0;i<toks.length;i++){var k=toks[i];if(!k)continue;
      if(k==='|'){cur=null;continue;}
      var m=/^(\d+)\/(\d+)(?::([\d+]+))?$/.exec(k);
      if(m){ts=[+m[1],+m[2]];groups=m[3]?m[3].split('+').map(Number):null;if(cur&&!cur.notes.length){cur.ts=ts.slice();cur.groups=groups;}continue;}
      m=/^(\d+)(?::(\d+))?$/.exec(k);
      if(m&&toks[i+1]==='('){tu={n:+m[1],in:m[2]?+m[2]:defIn(+m[1])};i++;continue;}
      if(k===')'){tu=null;continue;}
      m=/^(w|h|q|8|16|32)(\.{0,2})(r?)(~?)(>?)$/.exec(k);
      if(!m){errors.push('読めない書き方：'+k);continue;}
      var base={w:W,h:H,q:Q,'8':E,'16':S,'32':T32}[m[1]],len=base*(m[2]==='.'?1.5:m[2]==='..'?1.75:1);
      var n={len:len,rest:!!m[3],tie:!!m[4],accent:!!m[5]};
      if(tu){n.len=len*tu.in/tu.n;n.tu={n:tu.n,in:tu.in};}
      bar().notes.push(n);
    }
    return {bars:bars,errors:errors};
  }

  /* ───────── 升目（ことりノームの形）から ─────────
     pattern：叩く＝1、叩かない＝0 を並べたもの。div：1拍の升の数（1・2・3・4・5・6・8）
     hold：true なら次に叩くまで音を伸ばす（初期）、false なら升1つぶんの音符＋休符 */
  function fromGrid(pattern,o){
    o=o||{};var ts=o.ts||[4,4],div=o.div||4,hold=o.hold!==false,groups=o.groups||null;
    var bu=beatUnit(ts),perBar=ts[0]*div,nb=Math.max(1,Math.ceil(pattern.length/perBar)),bars=[];
    var tuplet=(div===3||div===5||div===6||div===7)?{n:div,in:defIn(div)}:null;
    var unit=bu/div;
    if(!tuplet){
      /* 普通の細かさ：ひと続きの流れを作ってから小節で切る（拍をまたぐ所は描く時にタイで分かれる） */
      var ev=[],i,last=-1;
      for(i=0;i<nb*perBar;i++){
        if(pattern[i]){ev.push({s:i,len:1,rest:false});last=ev.length-1;}
        else if(hold&&last>=0&&!(o.cutAtBar&&i%perBar===0)){ev[last].len++;}
        else{var pv=ev[ev.length-1];if(pv&&pv.rest&&Math.floor(pv.s/perBar)===Math.floor(i/perBar))pv.len++;else ev.push({s:i,len:1,rest:true});}
      }
      for(var b=0;b<nb;b++)bars.push({ts:ts.slice(),groups:groups,notes:[]});
      ev.forEach(function(e){var s=e.s,left=e.len,first=true;
        while(left>0){var bi=Math.floor(s/perBar),room=(bi+1)*perBar-s,take=Math.min(left,room);
          var n={len:take*unit,rest:e.rest};bars[bi].notes.push(n);
          left-=take;s+=take;if(left>0&&!e.rest)n.tie=true;first=false;}});
      return {bars:bars,errors:[]};
    }
    /* 連符の細かさ：拍ごとに1つの連符。拍をまたいで伸ばす音はタイでつなぐ */
    var carry=false;
    for(var bb=0;bb<nb;bb++){var bar={ts:ts.slice(),groups:groups,notes:[]};bars.push(bar);
      for(var bt=0;bt<ts[0];bt++){var base=bb*perBar+bt*div,k=0;
        while(k<div){var hit=!!pattern[base+k],j=k+1;
          if(hit||(hold&&carry&&k===0)){while(j<div&&!pattern[base+j]&&hold)j++;
            if(!hit){var prev=findPrev(bars);if(prev)prev.tie=true;}
            if(k===0&&j===div)bar.notes.push({len:bu,rest:false});           // 拍まるごとは普通の4分音符
            else{var r1=j-k,first=true;while(r1>0){var t1=r1;while(t1>1&&!shape(t1*unit*tuplet.n/tuplet.in))t1--;
              var nn={len:t1*unit,rest:false,tu:tuplet};if(!first){bar.notes[bar.notes.length-1].tie=true;}bar.notes.push(nn);r1-=t1;first=false;}}
            carry=hold;k=j;}
          else{while(j<div&&!pattern[base+j])j++;
            if(k===0&&j===div)bar.notes.push({len:bu,rest:true});              // 拍まるごとの休みは4分休符
            else{var r=j-k;while(r>0){var t=r;while(t>1&&!shape(t*unit*tuplet.n/tuplet.in))t--;bar.notes.push({len:t*unit,rest:true,tu:tuplet});r-=t;}}
            carry=false;k=j;}
        }
        if(!hold)carry=false;
      }
    }
    function findPrev(bs){for(var x=bs.length-1;x>=0;x--){var ns=bs[x].notes;if(ns.length)return ns[ns.length-1];}return null;}
    return {bars:bars,errors:[]};
  }

  /* ───────── 描ける形に整える（拍・小節の中央で分けてタイ） ───────── */
  var PIECES=[W*1.5,W,H*1.75,H*1.5,H,Q*1.75,Q*1.5,Q,E*1.5,E,S*1.5,S,T32];
  function normalize(score){
    var errors=(score.errors||[]).slice(),out=[],abs=0;
    score.bars.forEach(function(bar,bi){
      var ts=bar.ts||[4,4],L=barLen(ts),gs=beatGroups(ts,bar.groups),edges=[0],t=0,evs=[];
      gs.forEach(function(g){t+=g;edges.push(t);});
      var sum=bar.notes.reduce(function(a,n){return a+n.len;},0);
      if(sum>L+0.5)errors.push((bi+1)+'小節目：拍子より長い（'+Math.round(sum/Q*100)/100+'拍 ＞ '+Math.round(L/Q*100)/100+'拍）');
      var notes=bar.notes.slice();
      if(sum<L-0.5){errors.push((bi+1)+'小節目：拍子より短いので、残りを休符で埋めました');notes.push({len:L-sum,rest:true,filled:true});}
      var st=0;
      notes.forEach(function(n,ni){
        if(n.tu){var sh=shape(n.len*n.tu.n/n.tu.in);
          if(!sh)errors.push((bi+1)+'小節目：この連符の長さは描けません');
          evs.push({start:st,len:n.len,rest:!!n.rest,tie:!!n.tie,accent:!!n.accent,tu:n.tu,sh:sh||{b:'q',dots:0,unit:Q},src:ni});st+=n.len;return;}
        // 普通の音：まとまりの境目で分ける（両端がそろい、形があれば分けない）
        var parts=[],s=st,e=st+n.len,cuts=edges.slice(1,-1);
        var whole=n.rest&&near(s,0)&&near(e,L)&&notes.length===1;
        if(whole){evs.push({start:s,len:n.len,rest:true,wholeBar:true,sh:{b:'w',dots:0,unit:W},src:ni});st=e;return;}
        var aligned=edges.some(function(x){return near(x,s);});   // 拍の頭から始まる音は、形があればそのまま（付点4分など）
        var mid=(ts[0]===4&&ts[1]===4)?H:-1;
        var okWhole=aligned&&shape(n.len)&&!(mid>0&&s<mid-0.5&&e>mid+0.5&&!near(s,0));
        if(okWhole)parts.push([s,e]);
        else{var p=s;cuts.forEach(function(c){if(c>p+0.5&&c<e-0.5){parts.push([p,c]);p=c;}});parts.push([p,e]);}
        var pieces=[];
        parts.forEach(function(pe){var a=pe[0],len=pe[1]-pe[0];
          if(shape(len)){pieces.push([a,len]);return;}
          while(len>0.5){var k=0;while(k<PIECES.length&&PIECES[k]>len+0.5)k++;var v=PIECES[k]||len;pieces.push([a,v]);a+=v;len-=v;}});
        pieces.forEach(function(pc,pi){var last=pi===pieces.length-1;
          evs.push({start:pc[0],len:pc[1],rest:!!n.rest,tie:n.rest?false:(last?!!n.tie:true),accent:pi===0&&!!n.accent,sh:shape(pc[1])||{b:'q',dots:0,unit:Q},src:ni,cont:pi>0});});
        st=e;
      });
      evs.forEach(function(ev){ev.bar=bi;ev.abs=abs+ev.start;});
      out.push({ts:ts,groups:bar.groups,len:L,start:abs,edges:edges,events:evs});abs+=L;
    });
    // 前の音からタイで来ているか（音を鳴らさない）
    var all=[];out.forEach(function(b){all=all.concat(b.events);});
    all.forEach(function(ev,i){ev.i=i;var pv=all[i-1];ev.tiedIn=!!(pv&&pv.tie&&!pv.rest&&!ev.rest);});
    return {bars:out,events:all,total:abs,errors:errors};
  }

  /* ───────── 描く ───────── */
  var styled=false;
  function style(){if(styled)return;styled=true;var s=document.createElement('style');
    s.textContent='.ds-rhy{display:block;max-width:100%;height:auto;color:var(--ds-rhy-ink,#1c1a17)}'+
      '.ds-rhy .ds-rhy-cur{fill:var(--ds-rhy-hi,#e07b12)}'+
      '.ds-rhy .ds-rhy-on *{fill:var(--ds-rhy-hi,#e07b12)}';
    document.head.appendChild(s);}
  function el(n,a){var e=document.createElementNS(NS,n);for(var k in a)e.setAttribute(k,a[k]);return e;}
  function gw(k,sp){return GL[k][1]*sp/250;}
  function glyph(k,x,y,sp){return el('path',{d:GL[k][0],transform:'translate('+r2(x)+' '+r2(y)+') scale('+(sp/250)+')'});}
  function r2(v){return Math.round(v*100)/100;}

  function render(target,input,o){
    o=o||{};style();
    var sc=typeof input==='string'?parse(input):(input&&input.bars?input:{bars:input||[]});
    var N=normalize(sc);
    var sp=o.sp||9,mode=o.spacing||'time',staff=o.staff==null?1:o.staff;
    var box=typeof target==='string'?document.getElementById(target):target;
    var maxW=o.width||(box&&box.clientWidth)||640;
    var hw=gw('nhBlack',sp),stemW=sp*.12,stemL=sp*3.5;
    /* 幅を決める */
    var minLen=Q;N.events.forEach(function(ev){if(!ev.rest)minLen=Math.min(minLen,ev.len);});
    var beatW=Math.max(sp*6.5,(Q/minLen)*sp*1.9);
    N.bars.forEach(function(bar){
      if(mode==='time'){bar.inner=(bar.len/Q)*beatW;bar.events.forEach(function(ev){ev.rx=ev.start/bar.len*bar.inner;});}
      else{var cx=0;bar.events.forEach(function(ev){ev.rx=cx;cx+=sp*(1.6+2.6*Math.pow(ev.len/Q,.6))+(ev.sh.dots?sp*.5:0);});bar.inner=cx;}
    });
    /* 段に分ける */
    var systems=[],cur=null,x;
    N.bars.forEach(function(bar,bi){
      var showTs=bi===0||N.bars[bi-1].ts.join()!==bar.ts.join();
      var tsW=showTs?sp*3.2:0,need=tsW+sp*1.4+bar.inner+sp*1.2;
      if(!cur||(cur.w+need>maxW&&cur.bars.length)){cur={bars:[],w:sp*.8};systems.push(cur);}
      bar.showTs=showTs;bar.tsW=tsW;bar.need=need;cur.bars.push(bar);cur.w+=need;
    });
    /* 楽譜らしい間隔のときは、最後以外の段を幅いっぱいに広げる */
    systems.forEach(function(s,si){s.stretch=1;
      if(mode!=='time'&&si<systems.length-1&&o.justify!==false){var inner=s.bars.reduce(function(a,b){return a+b.inner;},0);var free=maxW-s.w;if(free>0)s.stretch=1+free/inner;}});
    var sysH=sp*10.5,width=0;
    var svg=el('svg',{'class':'ds-rhy',role:'img','aria-label':'リズム譜'});
    systems.forEach(function(s,si){
      var y0=si*sysH+sp*6.4;s.y0=y0;x=sp*.8;s.x0=x;
      s.bars.forEach(function(bar){
        bar.sys=si;bar.x=x;
        if(bar.showTs){var tx=x+sp*.4;[String(bar.ts[0]),String(bar.ts[1])].forEach(function(d,k){var w=d.split('').reduce(function(a,c){return a+gw('ts'+c,sp);},0),xx=tx+(sp*2.2-w)/2;
          d.split('').forEach(function(c){svg.appendChild(glyph('ts'+c,xx,y0+(k?sp:-sp),sp));xx+=gw('ts'+c,sp);});});}
        var bx=x+bar.tsW+sp*1.4;bar.ix=bx;
        bar.events.forEach(function(ev){ev.x=bx+ev.rx*s.stretch;ev.sys=si;});
        bar.endX=bx+bar.inner*s.stretch+sp*1.2;x=bar.endX;
      });
      s.x1=x;width=Math.max(width,x+sp*.8);
    });
    var height=systems.length*sysH+sp*1;
    svg.setAttribute('viewBox','0 0 '+r2(width)+' '+r2(height));svg.setAttribute('width',r2(width));svg.setAttribute('height',r2(height));
    var gLine=el('g',{fill:'currentColor'}),gNote=el('g',{fill:'currentColor'});svg.appendChild(gLine);svg.appendChild(gNote);
    var th=sp*.12;
    systems.forEach(function(s,si){var y0=s.y0,lines=staff===5?[-2,-1,0,1,2]:staff===1?[0]:[];
      lines.forEach(function(k){gLine.appendChild(el('rect',{x:r2(s.x0),y:r2(y0+k*sp-th/2),width:r2(s.x1-s.x0),height:r2(th)}));});
      var bh=staff===0?1.2:2;
      s.bars.forEach(function(bar,k){var last=bar===N.bars[N.bars.length-1];
        if(last){gLine.appendChild(el('rect',{x:r2(bar.endX-sp*.9),y:r2(y0-bh*sp),width:r2(sp*.14),height:r2(bh*2*sp)}));
          gLine.appendChild(el('rect',{x:r2(bar.endX-sp*.5),y:r2(y0-bh*sp),width:r2(sp*.5),height:r2(bh*2*sp)}));}
        else gLine.appendChild(el('rect',{x:r2(bar.endX-sp*.07),y:r2(y0-bh*sp),width:r2(sp*.14),height:r2(bh*2*sp)}));});
    });
    /* 音符・休符 */
    N.events.forEach(function(ev){var s=systems[ev.sys],y0=s.y0,g=el('g',{'data-i':ev.i});ev.g=g;gNote.appendChild(g);var b=ev.sh.b;
      if(ev.rest){var k=ev.wholeBar?'rWhole':{w:'rWhole',h:'rHalf',q:'rQuarter','8':'r8','16':'r16','32':'r32'}[b],rx=ev.x;
        if(ev.wholeBar){var bar=N.bars[ev.bar];rx=(bar.ix+bar.endX-sp*1.2)/2-gw(k,sp)/2;}
        g.appendChild(glyph(k,rx,y0,sp));
        for(var d=0;d<ev.sh.dots;d++)g.appendChild(glyph('dot',rx+gw(k,sp)+sp*(.3+.45*d),y0-sp*.5,sp));return;}
      var hk=b==='w'?'nhWhole':b==='h'?'nhHalf':'nhBlack';g.appendChild(glyph(hk,ev.x,y0,sp));
      var hwid=gw(hk,sp);for(var dd=0;dd<ev.sh.dots;dd++)g.appendChild(glyph('dot',ev.x+hwid+sp*(.35+.45*dd),y0-sp*.5,sp));
      if(ev.accent)g.appendChild(glyph('accent',ev.x+hwid/2-gw('accent',sp)/2,y0+sp*2.1,sp));
      ev.stemX=ev.x+hw-stemW;
    });
    /* 連桁・旗・連符 */
    N.bars.forEach(function(bar){var y0=systems[bar.sys].y0,evs=bar.events,runs=[],cur=null;
      function grp(t){for(var i=0;i<bar.edges.length-1;i++)if(t>=bar.edges[i]-0.5&&t<bar.edges[i+1]-0.5)return i;return -1;}
      // 連符のまとまり
      var tg=null,tgs=[];
      evs.forEach(function(ev){if(!ev.tu){tg=null;return;}
        if(!tg||tg.done||tg.n!==ev.tu.n||tg.in!==ev.tu.in){tg={n:ev.tu.n,in:ev.tu.in,list:[],sum:0,span:ev.sh.unit*ev.tu.in};tgs.push(tg);}  // 例：3連8分は 8分×2 の時間
        tg.list.push(ev);ev.tg=tg;tg.sum+=ev.len;
        if(tg.sum>=tg.span-0.5)tg.done=true;});
      evs.forEach(function(ev){var beam=!ev.rest&&LEVEL[ev.sh.b],gi=ev.tg?'t'+tgs.indexOf(ev.tg):grp(ev.start);
        if(beam&&cur&&cur.gi===gi){cur.list.push(ev);}else{cur=beam?{gi:gi,list:[ev]}:null;if(cur)runs.push(cur);}});
      runs=runs.filter(function(r){return r.list.length>1;});
      runs.forEach(function(r){r.list.forEach(function(ev){ev.run=r;});});
      evs.forEach(function(ev){if(ev.rest||ev.sh.b==='w')return;
        var lv=LEVEL[ev.sh.b]||0,top;
        if(ev.run){var ml=Math.max.apply(null,ev.run.list.map(function(e){return LEVEL[e.sh.b];}));top=y0-stemL-Math.max(0,ml-2)*sp*.75;ev.run.top=top;}
        else top=y0-stemL-(lv===2?sp*.3:lv===3?sp*1:0);
        ev.g.appendChild(el('rect',{x:r2(ev.stemX),y:r2(top),width:r2(stemW),height:r2(y0-top-sp*.18)}));
        if(!ev.run&&lv)ev.g.appendChild(glyph('flag'+ev.sh.b,ev.stemX,top,sp));
        ev.top=top;});
      runs.forEach(function(r){var L=r.list,a=L[0].stemX,z=L[L.length-1].stemX+stemW,by=r.top,bt=sp*.5;
        var gB=el('g',{});gNote.appendChild(gB);r.g=gB;
        gB.appendChild(el('rect',{x:r2(a),y:r2(by),width:r2(z-a),height:r2(bt)}));
        for(var lv=2;lv<=3;lv++){var y=by+(lv-1)*sp*.75;
          for(var i=0;i<L.length;i++){if((LEVEL[L[i].sh.b]||0)<lv)continue;var j=i;while(j+1<L.length&&(LEVEL[L[j+1].sh.b]||0)>=lv)j++;
            if(j>i)gB.appendChild(el('rect',{x:r2(L[i].stemX),y:r2(y),width:r2(L[j].stemX+stemW-L[i].stemX),height:r2(bt)}));
            else{var left=i===L.length-1||(i>0&&L[i-1].sh.dots),hl=sp*1.1;
              gB.appendChild(el('rect',{x:r2(left?L[i].stemX-hl+stemW:L[i].stemX),y:r2(y),width:r2(hl),height:r2(bt)}));}
            i=j;}}});
      tgs.forEach(function(tg){var L=tg.list,num=String(tg.n)+(tg.in!==defIn(tg.n)?':'+tg.in:'');
        var beamed=L.every(function(e){return e.run&&e.run===L[0].run;})&&L[0].run.list.length===L.length;
        var a=L[0].x,z=L[L.length-1].x+hw,mx,ny;
        var tw=String(tg.n).split('').reduce(function(s2,c){return s2+gw('tu'+c,sp);},0);
        if(beamed){mx=(L[0].stemX+L[L.length-1].stemX+stemW)/2;ny=L[0].run.top-sp*.55;}
        else{var yb=Math.min.apply(null,L.map(function(e){return e.top||y0;}))-sp*1.3;ny=yb+sp*.45;mx=(a+z)/2;
          gNote.appendChild(el('path',{d:'M'+r2(a)+' '+r2(yb+sp*.6)+'V'+r2(yb)+'H'+r2(mx-tw/2-sp*.4)+'M'+r2(mx+tw/2+sp*.4)+' '+r2(yb)+'H'+r2(z)+'V'+r2(yb+sp*.6),fill:'none',stroke:'currentColor','stroke-width':r2(sp*.12)}));}
        var xx=mx-tw/2;String(tg.n).split('').forEach(function(c){gNote.appendChild(glyph('tu'+c,xx,ny,sp));xx+=gw('tu'+c,sp);});});
    });
    /* タイ（符頭の下に弧。段をまたぐときは半分ずつ） */
    N.events.forEach(function(ev,i){if(!ev.tie||ev.rest)return;var nx=N.events[i+1];if(!nx||nx.rest)return;
      function arc(a,z,y0){var y=y0+sp*.75,h=sp*1.05*Math.min(1,Math.max(.55,(z-a)/(sp*5)));
        gNote.appendChild(el('path',{d:'M'+r2(a)+' '+r2(y)+'Q'+r2((a+z)/2)+' '+r2(y+h)+' '+r2(z)+' '+r2(y)+'Q'+r2((a+z)/2)+' '+r2(y+h*.72)+' '+r2(a)+' '+r2(y)+'Z'}));}
      if(nx.sys===ev.sys)arc(ev.x+hw*.75,nx.x+hw*.25,systems[ev.sys].y0);
      else{arc(ev.x+hw*.75,systems[ev.sys].x1-sp*.3,systems[ev.sys].y0);arc(systems[nx.sys].x0+sp*.4,nx.x+hw*.25,systems[nx.sys].y0);}});
    /* 縦の線 */
    var cursor=el('rect',{'class':'ds-rhy-cur',x:0,y:0,width:r2(sp*.28),height:r2(sp*8),rx:r2(sp*.14),opacity:0});svg.appendChild(cursor);
    if(box){box.innerHTML='';box.appendChild(svg);}
    /* 時刻（刻み）→ 位置 */
    function posAt(tick){
      var bar=null;for(var i=0;i<N.bars.length;i++){if(tick>=N.bars[i].start-0.5)bar=N.bars[i];}
      if(!bar)bar=N.bars[0];var rel=tick-bar.start,evs=bar.events,a=null,b=null;
      for(var k=0;k<evs.length;k++){if(evs[k].start<=rel+0.5)a=evs[k];else{b=evs[k];break;}}
      var s=systems[bar.sys],ax=a?a.x:bar.ix,at=a?a.start:0,bx=b?b.x:bar.endX-sp*1.1,btk=b?b.start:bar.len;
      return {x:ax+(bx-ax)*Math.max(0,Math.min(1,(rel-at)/Math.max(1,btk-at))),y0:s.y0};
    }
    var view={svg:svg,el:box,events:N.events,bars:N.bars,total:N.total,errors:N.errors,sp:sp,
      cursor:function(tick){if(tick==null||tick<0||tick>N.total){cursor.setAttribute('opacity',0);return;}
        var p=posAt(tick);cursor.setAttribute('x',r2(p.x-sp*.14));cursor.setAttribute('y',r2(p.y0-sp*5));cursor.setAttribute('opacity',.9);},
      light:function(i,on){var ev=N.events[i];if(ev&&ev.g)ev.g.classList.toggle('ds-rhy-on',!!on);},
      clear:function(){cursor.setAttribute('opacity',0);N.events.forEach(function(ev){ev.g&&ev.g.classList.remove('ds-rhy-on');});}};
    return view;
  }

  /* ───────── 鳴らす（clock.js があれば使う） ───────── */
  function mini(o){ // clock.js が読めないときの小さな代わり
    var ctx=o.context,bpm=o.bpm,meter=o.meter,pend=null,hs={tick:[]},bar=-(o.countIn||0),beat=0,next=0,id=null;
    return {on:function(e,f){(hs[e]=hs[e]||[]).push(f);},set:function(c){if(c.meter)pend=c.meter.slice();if(c.bpm)bpm=c.bpm;},
      start:function(at){next=at!=null?at:ctx.currentTime+.05;id=setInterval(function(){while(next<ctx.currentTime+.15){var p={bar:bar,beat:beat,countIn:bar<0,first:beat===0,bpm:bpm,meter:meter.slice(),head:true};
        hs.tick.forEach(function(f){f(next,p);});next+=60/bpm*4/meter[1];beat++;if(beat>=meter[0]){beat=0;bar++;if(pend){meter=pend;pend=null;}}}},25);},
      destroy:function(){clearInterval(id);},context:function(){return ctx;}};
  }
  function heard(ctx){if(ctx.getOutputTimestamp&&G.performance){var ts=ctx.getOutputTimestamp();if(ts&&ts.contextTime>0)return ts.contextTime+(performance.now()-ts.performanceTime)/1000;}
    return ctx.currentTime-(ctx.outputLatency||ctx.baseLatency||0);}
  function beep(ctx,t,f,v,dec){var o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=f;o.type='triangle';g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+dec);o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+dec+.02);}

  function play(view,o){
    o=o||{};var bpm=o.bpm||90,loop=!!o.loop,show=o.show||'cursor',metro=o.metronome!==false;
    var snd=DS.sound&&DS.sound.context?DS.sound:null;
    var ctx=o.context||(snd?snd.context():new (G.AudioContext||G.webkitAudioContext)());
    if(ctx.state==='suspended')try{ctx.resume();}catch(e){}
    var bars=view.bars,nb=bars.length,anchors=[],onsets=[],endT=null,alive=true,raf=0,clk=null,lit=-1;
    var ctl={onsets:onsets,stop:stop,judge:judge,playing:function(){return alive;}};
    function noteSound(t,ev){
      if(typeof o.sound==='function')return o.sound(t,ev);
      if(o.sound===false)return;
      if(snd&&snd.isReady&&snd.isReady('drums'))snd.drum(o.drum||'rim',{time:t,vel:ev.accent?1:.8});else beep(ctx,t,ev.accent?1250:1000,ev.accent?.5:.35,.07);}
    function clickSound(t,acc){if(snd&&snd.click)snd.click(acc,{time:t,vel:.45});else beep(ctx,t,acc?2000:1600,.18,.04);}
    function begin(){
      if(!alive)return;
      var opt={bpm:bpm,meter:bars[0].ts.slice(),div:1,countIn:o.countIn==null?1:o.countIn,sound:false,context:ctx};
      clk=(DS.clock&&DS.clock.create)?DS.clock.create(opt):mini(opt);
      clk.on('tick',function(t,p){
        if(p.countIn){clickSound(t,p.first);return;}
        var bi=p.bar;if(loop)bi=((bi%nb)+nb)%nb;
        if(bi>=nb){if(endT==null)endT=t;return;}
        var bar=bars[bi],nx=bars[(bi+1)%nb];
        if(p.beat===0&&nx&&(bi+1<nb||loop)&&nx.ts.join()!==bar.ts.join())clk.set({meter:nx.ts.slice()});
        var unit=beatUnit(bar.ts),b0=p.beat*unit,sec=60/p.bpm/Q,loopOff=loop?Math.floor(p.bar/nb)*view.total:0;
        anchors.push({t:t,tick:bar.start+b0+loopOff,sec:sec,base:bar.start+b0,unit:unit});if(anchors.length>64)anchors.shift();
        if(metro)clickSound(t,p.beat===0);
        bar.events.forEach(function(ev){if(ev.rest||ev.tiedIn||ev.start<b0-0.5||ev.start>=b0+unit-0.5)return;
          var tt=t+(ev.start-b0)*sec;noteSound(tt,ev);onsets.push({i:ev.i,t:tt});if(onsets.length>512)onsets.shift();
          if(o.onNote)o.onNote(ev,tt);});
      });
      clk.start();
      raf=requestAnimationFrame(frame);
    }
    function frame(){if(!alive)return;var h=heard(ctx),a=null;
      for(var i=anchors.length-1;i>=0;i--){if(anchors[i].t<=h){a=anchors[i];break;}}
      if(a){var tk=a.base+Math.min(a.unit,(h-a.t)/a.sec);
        if(show!=='light')view.cursor(tk);
        if(show!=='cursor'){var idx=-1;view.events.forEach(function(ev){if(!ev.rest&&ev.abs<=tk+0.5)idx=ev.i;});if(idx!==lit){if(lit>=0)view.light(lit,false);if(idx>=0)view.light(idx,true);lit=idx;}}}
      if(endT!=null&&h>=endT){stop();if(o.onEnd)o.onEnd();return;}
      raf=requestAnimationFrame(frame);}
    function stop(){if(!alive&&!clk)return;alive=false;cancelAnimationFrame(raf);if(clk){clk.destroy();clk=null;}view.clear();}
    /* タップのずれ：一番近い音との差（ms、＋が遅い）。端末の遅れは clock.js の共通の補正を使う */
    function judge(e,opt){opt=opt||{};var t=typeof e==='number'?e:ctx.currentTime-((e&&e.timeStamp&&G.performance)?Math.max(0,(performance.now()-e.timeStamp)/1000):0);
      var lat=opt.latency!=null?opt.latency:(DS.clock&&DS.clock.latency?DS.clock.latency.ms(ctx):(ctx.outputLatency||0)*1000);t-=lat/1000;
      var best=null;onsets.forEach(function(x){if(!best||Math.abs(t-x.t)<Math.abs(t-best.t))best=x;});
      return best?{i:best.i,diff:Math.round((t-best.t)*1000),t:best.t}:null;}
    if(snd&&snd.load&&o.sound!==false&&typeof o.sound!=='function'&&!(snd.isReady&&snd.isReady('drums'))){
      var p=snd.load('drums');if(p&&p.then)p.then(begin,begin);else begin();}
    else begin();
    return ctl;
  }

  DS.rhythm={version:'1.0',T:{WHOLE:W,HALF:H,QUARTER:Q,EIGHTH:E,SIXTEENTH:S,THIRTYSECOND:T32},
    parse:parse,fromGrid:fromGrid,normalize:normalize,render:render,play:play};
})();
