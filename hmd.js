// # project handmade markdown decoder (hmd)
//  - written by ricale
//  - version 0.2.2
//  - ricale@hanmail.net or kim.kangseong@gmail.com

// ## 사용법
// RICALE.hmd.run(sourceTextareaSelector, targetElementSelector)

if(typeof(RICALE) == typeof(undefined)) {
	// 다른 사람과의 이름 충돌을 피하기 위한 최상위 네임스페이스
	var RICALE = {};
}

// RICALE 네임스페이스 내에서 hmd를 분리하기 위한 네임스페이스
RICALE.HMD = {};

// 문장 당 해석 결과를 담기 위한 클래스
RICALE.HMD.TranslateSentence = function() {
	// 이 문장의 실제 내용 (string)
	this.child = null;
	// 이 문장에 적용될 HTML의 블록요소를 구분하기 위한 구분자 (string)
	this.tag = null;
	// 이 문장의 목록 요소 중첩 정도 (integer)
	this.level = 0;
	// 이 문장의 인용 블록 요소 중첩 정도 (integer)
	this.quote = 0;
}

// 참조 스타일의 이미지/링크 요소가 사용되었을 때
// 사용될 이미지/링크의 정보를 담기 위한 클래스
RICALE.HMD.ReferencedId = function(url, title) {
	// 이미지/링크의 url
	this.url = url;
	// 이미지/링크의 title/alt
	this.title = title;
}



// 마크다운 문법을 HTML 문법으로 번역하는 클래스
// run(sourceTextareaSelector, targetElementSelector) : 번역을 활성화한다.
// setAdditionalDecodeInlineFunction(func) : 추가적인 인라인 문법 번역 함수를 설정한다.
RICALE.HMD.Decoder = function() {
	// 번역한 결과가 출력될 HTML 요소
	this.targetSelector = null;

	// 문장 별 해석 결과(RICALE.HMD.TranslateSentence)의 배열
	this.result = Array();

	// 참조 스타일의 이미지/링크 요소 사용 시 참조 정보를 담은 해시.
	// (key:아이디) - (value:RICALE.HMD.ReferenceId 의 객체) 형식이다.
	this.refId = {};

	// 목록 요소의 레벨 계산을 위한 (정수) 배열
	this.listLevel = Array();
	this.listLevelInBlockquote = Array();

	// 사용자가 추가하는 인라인 요소 번역 메서드.
	this.additionalDecodeInline = null;
}

RICALE.HMD.Decoder.prototype = {
	// 어떤 마크다운 문법이 적용되었는지 구분할 때 쓰일 구분자들 (string) 
	P: "p",
	H1: "h1",
	H2: "h2",
	H3: "h3",
	H4: "h4",
	H5: "h5",
	H6: "h6",
	HR: "hr",
	UL: "ul",
	OL: "ol",
	BLANK: "blank",
	CODEBLOCK: "codeblock",

	// ### 블록 요소 마크다운의 정규 표현식들

	// 반드시 지켜져야 할 해석 순서
	// Blockquote > Heading Underlined > HR > (UL, OL, ContinuedList) > (Codeblock, Heading, ReferencedId)
	// Blank > Codeblock

	regExpBlockquote: /^[ ]{0,3}(>+) ([ ]*.*)$/,
	regExpH1Underlined: /^=+$/,
	regExpH2Underlined: /^-+$/,
	regExpHR: /^[ ]{0,3}([-_*]+)[ ]*\1[ ]*\1[ ]*$/,
	regExpUL: /^([\s]*)[*+-][ ]+(.*)$/,
	regExpOL: /^([\s]*)[\d]+\.[ ]+(.*)$/,
	regExpBlank: /^[\s]*$/,
	regExpContinuedList: /^([\s]{1,8})([\s]*)(.*)/,
	regExpCodeblock: /^([ ]{0,3}\t|[ ]{4})([\s]*.*)$/,
	regExpHeading: /^(#{1,6}) (.*[^#])(#*)$/,
	regExpReferencedId: [
		/^[ ]{0,3}\[([^\]]+)\]:[\s]*<([^\s>]+)>[\s]*(?:['"(](.*)["')])?$/,
		/^[ ]{0,3}\[([^\]]+)\]:[\s]*([^\s]+)[\s]*(?:['"(](.*)["')])?$/
	],

	// ### 인라인 요소 마크다운의 정규 표현식들

	// 반드시 지켜져야 할 해석 순서
	// - Strong > EM
	// - Img > Link
	// - ImgInline > LineInline

	regExpStrong: [
		/\*\*([^\*\s]{1,2}|\*[^\*\s]|[^\*\s]\*|(?:[^\s].+?[^\s]))\*\*/g,
		/__([^_\s]{1,2}|_[^_\s]|[^_\s]_|(?:[^\s].+?[^\s]))__/g
	],
	regExpEM: [
		/\*([^\*\s]{1,2}|[^\s].+?[^\s])\*/g,
		/_([^_\s]{1,2}|[^\s].+?[^\s])_/g
	],
	regExpImg: RegExp(/!\[([^\]]+)\][\s]*\[([^\]]*)\]/g),
	regExpLink: RegExp(/\[([^\]]+)\][\s]*\[([^\]]*)\]/g),
	regExpImgInline: /!\[([^\]]+)\][\s]*\(([^\s\)]+)(?: "(.*)")?\)/g,
	regExpLinkInline: /\[([^\]]+)\][\s]*\(([^\s\)]+)(?: "(.*)")?\)/g,
	regExpLinkAuto: /<(http[s]?:\/\/[^>]+)>/g,
	regExpCode: [
		/``[\s]*(.+?)[\s]*``/g,
		/`([^`]+)`/g
	],
	regExpBreak: /(  )$/,
	regExpEscape: /\\([-_\*+\.>#\[\]\(\)`])/,
	regExpReturnEscape: /\\EC([1-9A-C])\\/,

	replacerForEscapeCharacter: {
		'-': '\\EC1\\',
		'_': '\\EC2\\',
		'*': '\\EC3\\',
		'+': '\\EC4\\',
		'.': '\\EC5\\',
		'>': '\\EC6\\',
		'#': '\\EC7\\',
		'[': '\\EC8\\',
		']': '\\EC9\\',
		'(': '\\ECA\\',
		')': '\\ECB\\',
		'`': '\\ECC\\',
		'1': '-',
		'2': '_',
		'3': '*',
		'4': '+',
		'5': '.',
		'6': '&gt;',
		'7': '#',
		'8': '[',
		'9': ']',
		'A': '(',
		'B': ')',
		'C': '`'
	},

	// ### public method
	// (물론 실제로 JavaScript에 접근 지정자는 없다. 단지 의도가 그렇다는 것이다.)

	// 마크다운 형식을 HTML형식으로 번역한다.
	// 이 메서드를 실행하면 sourceTextareaSelector의 HTML 요소에서 keyup 이벤트가 있을 때마다
	// 번역을 수행한다.
	// - sourceTextareaSelector : 마크다운 형식의 문자열이 있는 HTML의 textarea 요소의 셀렉터
	// - targetElementSelector : HTML 형식의 번역 결과가 출력될 HTML 요소의 셀렉터
	run: function(sourceTextareaSelector, targetElementSelector) {
		var interval = null,
			self = this;

		this.targetSelector = targetElementSelector;

		// 파이어폭스는 한글 상태에서 키보드를 눌렀을 때 최초의 한 번을 제외하고는 이벤트가 발생하지 않는 괴이한 현상이 있다.
		// 그래서 브라우저가 파이어폭스일때는 최초의 한 번을 이용, 강제로 이벤트를 계속 발생시킨다.
		$(sourceTextareaSelector).keydown(function(event) {
			if(navigator.userAgent.toLowerCase().indexOf('firefox') != -1) {
				if (event.keyCode == 0) {
					if(interval == null) {
						interval = setInterval(function() {
							$(sourceTextareaSelector).trigger('keyup');
						}, 100);
					}

				} else {
					if(interval != null) {
						clearInterval(interval);
						interval = null;
					}
				}
			}
		});

		$(sourceTextareaSelector).keyup(function(event) {
			self.translate($(sourceTextareaSelector).val());
		});

		$(sourceTextareaSelector).trigger('keyup');
	},

	// 추가적인 인라인 요소 번역 함수를 설정한다.
	// 이는 기존의 인라인 요소 문법에 대한 확인이 모두 끝난 다음에 실행된다.
	setAdditionalDecodeInlineFunction: function(func) {
		this.additionalDecodeInline = func;
	},

	// ### private method
	// (물론 실제로 JavaScript에 접근 지정자는 (이하생략))

	// 마크다운 형식을 HTML형식으로 번역한다.
	// - sourceString : 마크다운 형식의 문자열
	// - targetElement : HTML 형식의 번역 결과가 출력될 HTML 요소
	translate: function(sourceString) {
		// 타겟 요소의 문자열을 줄 단위로 끊어 배열로 저장한다.
		var array = sourceString.split(/\n/), i, now, result;

		this.init();

		// 한 줄 한 줄이 어떤 마크다운에 해당하는 지 체크한다.
		for(i = 0, now = 0; i < array.length; i++) {
			// 참조 스타일의 링크/이미지 기능을 위한 참조 문자열이었다면
			// 실제로 보이는 문자열이 아니므로 지나친다.
			if((result = this.match(array[i], now)) == null) {
				continue;
			}

			this.result[now] = result;

			// 이전까지 목록 요소들이었다가
			// 현재 줄에서 목록 요소가 아니게 되면 목록 관련 계산 배열을 초기화한다.
			if(this.result[now].tag != this.BLANK && this.result[now].level == 0) {
				if(this.listLevel.length > 0) {
					this.listLevel = Array();
					this.listLevelInBlockquote = Array();
				}

				if(this.listLevelInBlockquote.length > 0) {
					this.listLevelInBlockquote = Array();
				}
			}

			now++;
		}

		// 줄 단위로 해석한 것을 통합해서 번역한다.
		this.decode();
	},

	// 번역 시 필요한 정보를 초기화한다.
	init: function() {
		this.result = Array();
		this.refId = {};
		this.listLevel = Array();
		this.listLevelInBlockquote = Array();
	},

	// 문자열(string)에 어떤 마크다운 문법 (블록 요소 기준) 이 적용되었는지 확인한다.
	// 문자열의 줄번호(now)는, 어떠한 마크다운 문법과도 매치되지 않는 문장일 경우
	// 목록 요소로부터 늘어진 블록 요소인지 확인하기 위해 쓰인다.
	// RICALE.HMD.MarkdownSentence 객체를 반환한다.
	match: function(string, now) {
		// 인용 블록 요소가 포함되어있는 지 확인한다.
		// 오직 인용 블록 요소만이 다른 블록 요소와 중첩될 수 있다.
		var result = this.matchBlockquotes(string, now),
			line = null,
			isContinuedList = false, isLine, headingLevel;

		// 빈 줄인지 확인한다.
		if((line = result.child.match(this.regExpBlank)) != null) {
			result.tag   = this.BLANK;
			result.child = "";
			return result;
		}

		// 밑줄 스타일의 H1 문법인지 확인한다.
		// 만약 맞다면 이 줄 자체는 아무런 의미가 없기 때문에 null을 반환한다.
		if((line = result.child.match(this.regExpH1Underlined)) != null && now != 0 && this.result[now - 1].tag == this.P) {
			this.result[now - 1].tag = this.H1;
			return null;
		}

		// 밑줄 스타일의 H2 문법인지 확인한다.
		// 만약 맞다면 이 줄 자체는 아무런 의미가 없기 때문에 null을 반환한다.
		if((line = result.child.match(this.regExpH2Underlined)) != null && now != 0 && this.result[now - 1].tag == this.P) {
			this.result[now - 1].tag = this.H2;
			return null;
		}

		// hR 문법인지 확인한다.
		if((line = result.child.match(this.regExpHR)) != null) {
			result.tag   = this.HR;
			result.child = "";
			return result;
		}

		// UL 문법인지 확인한다.
		// 모양만 유사한 코드 블록일 가능성도 있다.
		if((line = result.child.match(this.regExpUL)) != null) {
			isLine = this.isThisReallyListElement(this.UL, line, result);
			if(isLine !== false) {
				return isLine;
			} else {
				line = result.child.match(this.regExpCodeblock);
				return this.getCodeblockResult(line, result);
			}
		}

		// OL 문법인지 확인한다.
		// 모양만 유사한 코드 블록일 가능성도 있다.
		if((line = result.child.match(this.regExpOL)) != null) {
			isLine = this.isThisReallyListElement(this.OL, line, result);
			if(isLine !== false) {
				return isLine;
			} else {
				line = result.child.match(this.regExpCodeblock);
				return this.getCodeblockResult(line, result);
			}
		}

		// 목록 요소에서 이어지는 블록 요소인지 확인한다.
		// 다른 요소 확인 때는 인용 블록 요소를 체크한 결과(result.child)를 이용해 확인하지만,
		// 여기서 만큼은 원본 문자열(string)로 확인한다.
		if((isContinuedList = this.matchContinuedList(string, now, result)) != false) {
			return isContinuedList;
		}

		// 제목(h1, h2, h3, h4, h5, h6) 문법인지 확인한다.
		if((line = result.child.match(this.regExpHeading)) != null) {
			headingLevel = line[1].length;

			switch(headingLevel) {
				case 1: result.tag = this.H1; break;
				case 2: result.tag = this.H2; break;
				case 3: result.tag = this.H3; break;
				case 4: result.tag = this.H4; break;
				case 5: result.tag = this.H5; break;
				case 6: result.tag = this.H6; break;
			}

			result.child = line[2];
			return result;
		}

		// 참조 스타일의 이미지/링크 요소를 위한 참조 문자열 문법인지 확인한다.
		if((line = result.child.match(this.regExpReferencedId[0])) == null) {
			line = result.child.match(this.regExpReferencedId[1]);
		}
		if(line != null) {
			this.refId[line[1]] = new RICALE.HMD.ReferencedId(line[2], line[3]);
			return null;
		}

		// 코드블록(pre code) 문법인지 확인한다.
		if((line = result.child.match(this.regExpCodeblock)) != null) {
			return this.getCodeblockResult(line, result);
		}

		// 어떠한 문법과도 일치하지 않는다면 문단(p) 문법으로 판단한다.
		result.tag = this.P;
		return result;

	}, // end function match

	// 이 줄(string)이 인용 요소에 포함된 줄인지,
	// 포함되어 있다면 인용 요소가 몇 번이나 중첩되어 있는지 확인한다.
	// 인용 블록 요소 확인 결과가 담긴 RICALE.HMD.TranslateSentence 객체를 반환한다.
	matchBlockquotes: function(string, now) {
		var result = new RICALE.HMD.TranslateSentence(),
			line = null;

		result.child = string;

		while(true) {
			line = result.child.match(this.regExpBlockquote);
			if(line == null) {
				return result;
			}

			result.quote += line[1].length;
			result.child = line[2];
		}
	},

	// UL/OL의 정규 표현식과 일치한 결과(line)가
	// a. 진짜 UL/OL인지,
	// b. UL/OL과 비슷한 형식을 취하고 있는 CODEBLOCK인지
	// 확인한다.
	// a의 경우 정확히 무엇인지(UL/OL) 결과 값을 반환하고
	// b의 경우 false를 반환한다.
	isThisReallyListElement: function(tag, line, result) {
		var r = this.getListLevel(line[1], result.quote != 0);

		if(r.tag != this.CODEBLOCK) {
			result.tag   = r.tag != null ? r.tag : tag;
			result.level = r.level;
			result.child = line[2];
			return result;

		} else {
			return false;
		}
	},

	// 목록 요소의 레벨을 이 줄의 들여쓰기(blank)를 통해 계산해 반환한다.
	// 목록 요소와 유사한 형태의 CODEBLOCK이라면 해당 결과를 반환한다.
	getListLevel: function(blank, isInBq) {
		// 이 줄의 들여쓰기가 몇 개의 공백으로 이루어져있는지 확인한다.
		var space = this.getIndentLevel(blank),
			result = new RICALE.HMD.TranslateSentence(),
			levels = isInBq ? this.listLevelInBlockquote : this.listLevel,
			now, exist, i;

		// 현재 문법을 확인하고 있는 문자열이 목록 요소의 시작이라면
		// a. 공백이 3 이하라면 목록의 레벨은 1이 된다.
		// b. 공백이 3 초과라면 이 줄은 목록 요소가 아니라 코드블록 요소이다.
		if(levels.length == 0) {
			if(space <= 3) {
				levels[0] = space;

				result.level = 1;

			} else {
				result.tag = this.CODEBLOCK;
			}

		// 현재 목록 레벨이 1만 존재하는 상황에서
		// a. 목록 레벨 1과 들여쓰기가 같다면 이 줄은 레벨 1이 된다.
		// b. 목록 레벨 1과 들여쓰기가 다르고 공백이 7 이하라면 레벨 2가 된다.
		// c. 공백이 7 초과라면 이 줄은 목록 요소가 아니라 코드블록 요소이다.
		} else if (levels.length == 1) {
			if(space == levels[0]) {
				result.level = 1;

			} else if(space <= 7) {
				levels[1] = space;

				result.level = 2;

			} else {
				result.tag = this.CODEBLOCK;
			}

		// 현재 목록 레벨이 2 이상 존재하는 상황에서
		// a. 공백이 (현재 목록 레벨 + 1) * 4 보다 크면 이 줄은 전 줄의 목록 요소에서 이어지는 문단 요소이다.
		// b. 공백이 현재 목록 레벨의 공백보다 크고, (현재 목록 레벨 - 1) * 4 보다도 크면 이 줄은 현재 목록 레벨 + 1이다.
		// c. a, b에 포함되지 않고, 현재 목록 레벨의 공백보다 크거나 같으면 이 줄의 목록 레벨은 현재 목록 레벨과 동일하다.
		// d. a, b, c에 포함되지 않고, 현재 목록 레벨 이 전의 특정 목록 레벨보다 크거나 같다면 이 줄의 목록 레벨은 해당 목록 레벨과 동일하다.
		} else {
			now = levels.length;

			if(space >= (now + 1) * 4) {
				result.tag = this.P;
				result.level = now;

			} else if(space > levels[now - 1] && space > (now - 1) * 4) {
				levels[now] = space;

				result.level = now + 1;

			} else if(space >= levels[now - 1]) {
				result.level = now;

			} else {
				exist = false;
				for(i = now - 2; i >= 0 ; i--) {
					if(space >= levels[i]) {
						levels = levels.slice(0, i + 1);

						result.level = i + 1;
						exist = true;
						break;
					}
				}

				if(!exist) {
					result.tag = this.P;
					result.level = now;
				}
			}
		}

		if(isInBq) {
			result.level += this.listLevel.length;
			this.listLevelInBlockquote = levels;
		} else {
			this.listLevel = levels;
		}

		levels = null;

		return result;
	},

	// 들여쓰기(blank)가 몇 개의 공백(space)인지 확인해 결과를 반환한다.
	// 탭(tab) 문자는 4개의 공백으로 계산한다.
	getIndentLevel: function(blank) {
		var indent = blank.match(/([ ]{0,3}\t|[ ]{4}|[ ]{1,3})/g),
			space = 0, i;

		if(indent != null) {
			for(i = 0; i < indent.length; i++) {
				if(indent[i].match(/^[ ]{1,3}$/) != null) {
					space += indent[i].length;
				} else {
					space += 4;
				}
			}
		}

		return space;
	},

	// CODEBLOCK의 정규 표현식과 일치한 결과(line)를
	// 사용하기 적절한 결과 값으로 변환해 반환한다.
	getCodeblockResult: function(line, result) {
		result.tag   = this.CODEBLOCK;
		result.child = line[2];
		return result;
	},

	// 문자열(string)이 목록 요소로부터 늘어진 블록 요소인지 확인해 결과를 반환한다.
	matchContinuedList: function(string, now, last) {
		var result = new RICALE.HMD.TranslateSentence(),
			above = this.aboveExceptBlank(now),
			prev = this.previousLine(now),
			line = string.match(this.regExpContinuedList),
			indent;

		// 1. 빈 줄을 포함한 바로 윗 줄이 존재하는 가운데,
		// 2. 그 윗줄의 목록 요소 레벨이 0이 아니라면
		// (=> 목록 요소가 계속 이어지고 있다면)
		// 이 줄은 목록 요소 내부의 문단 요소이다.
		if(prev != null && prev.level != 0) {

			// a
			if(line != null && prev.tag == this.CODEBLOCK && this.getIndentLevel(line[1]) == 8) {
				if((prev.level - 1) * 4 <= this.getIndentLevel(line[2])) {
					result.tag = this.CODEBLOCK;
					result.child = line[2].slice((prev.level - 1) * 4) + line[3];
					result.level = prev.level;
					result.quote = last.quote;

					return result;
				}
			}

			result = this.matchBlockquotes(string);
			result.tag = this.P;
			result.level = prev.level;

			return result;

			// 1. 빈 줄을 제외한 바로 윗 줄이 존재하고,
			// 2. 그 줄의 목록 요소 레벨이 0이 아니고
			// (=> 바로 윗 줄은 공백이 최소 한 줄 있으며, 그 공백들 바로 위의 문장은 목록 요소가 이어지는 중이었다면)
			// 3. 또, 목록 내부의 문단 요소로써 문법도 일치한다면
			// 이것은
			//   a. 목록 요소 내부의 코드 블록이거나
			//   b. 목록 요소 내부의 인용 블록이거나
			//   c. 목록 요소 내부의 문단 요소이다.
		} else if(above != null && above.level != 0) {

			if(line == null) {
				result = this.matchBlockquotes(string);
				if(result.quote == above.quote) {
					line = result.child.match(this.regExpContinuedList);

					if(line == null) {
						return false;
					}
				} else {
					return false;
				}
			}

			// a
			if(this.getIndentLevel(line[1]) == 8) {
				if((above.level - 1) * 4 <= this.getIndentLevel(line[2])) {
					result.tag = this.CODEBLOCK;
					result.child = line[2].slice((above.level - 1) * 4) + line[3];
					result.level = above.level;
					result.quote = last.quote;

					return result;
				}
			}

			// b 혹은 c
			result = this.match(line[3]);
			indent = this.getIndentLevel(line[1] + line[2]);
			indent = indent / 4 - indent / 4 % 1 + (indent % 4 != 0);

			result.level += indent > above.level ? above.level : indent;
			result.quote = above.quote;

			return result;
		}

		// 위의 어떠한 사항에도 해당하지 않는다면 이 줄은 목록 요소 내부의 블록 요소가 아니다.
		return false;
	},

	// 빈 줄을 제외한 바로 윗줄을 얻는다.
	// 존재하지 않으면 null을 반환한다.
	aboveExceptBlank: function(index) {
		for(var i = index - 1; i >= 0; i--) {
			if(this.result[i].tag != this.BLANK) {
				return this.result[i];
			}
		}

		return null;
	},

	// 빈 줄을 제외한 바로 아랫줄을 얻는다.
	// 존재하지 않으면 null을 반환한다.
	belowExceptBlank: function(index) {
		for(var i = index + 1; i < this.result.length; i++) {
			if(this.result[i].tag != this.BLANK) {
				return this.result[i];
			}
		}

		return null;
	},

	// 빈 줄을 포함한 바로 윗줄을 얻는다.
	// 존재하지 않으면 null을 반환한다.
	previousLine: function(index) {
		return index > 1 ? this.result[index - 1] : null;
	},

	// 빈 줄을 포함한 바로 아랫줄을 얻는다.
	// 존재하지 않으면 null을 반환한다.
	nextLine: function(index) {
		return index < this.result.length - 1 ? this.result[index + 1] : null;
	},

	// 현재 이어지고 있는 목록 요소가 끝나고 난 뒤의 줄 번호를 얻는다.
	idxBelowThisList: function(index) {
		for(var i = index + 1; i < this.result.length; i++) {
			if(this.result[i].level == 0) {
				return i + 1 < this.result.length ? i : null;
			} else if(this.result[i].tag == this.UL || this.result[i].tag == this.OL) {
				return null;
			}
		}

		return null;
	},

	// 현재 이어지고 있는 목록 요소가 시작하기 전의 줄 번호를 얻는다.
	idxAboveThisList: function(index) {
		for(var i = index - 1; i >= 0; i--) {
			if(this.result[i].level == 0) {
				return i - 1 >= 0 ? i : null ;
			} else if(this.result[i].tag == this.UL || this.result[i].tag == this.OL) {
				return null;
			}
		}

		return null;
	},

	// 블록 요소에 대한 해석이 끝난 줄의 본문(string)의 인라인 문법들을 찾아 바로 번역한다.
	// 아무런 인라인 문법도 포함하고 있지 않다면 인자를 그대로 반환한다.
	// 추가적으로 사용자가 번역 함수를 추가했다면 해당 함수 또한 실행된다.
	decodeInline: function(string) {
		var i, line, id;

		while((line = string.match(this.regExpEscape)) != null) {
			string = string.replace(line[0], this.replacerForEscapeCharacter[line[1]]);
		}

		// 문자열 내에 strong 요소가 있는지 확인하고 번역
		string = string.replace(this.regExpStrong[0], '<strong>$1</strong>');
		string = string.replace(this.regExpStrong[1], '<strong>$1</strong>');

		// 문자열 내에 em 요소가 있는지 확인하고 번역
		string = string.replace(this.regExpEM[0], '<em>$1</em>');
		string = string.replace(this.regExpEM[1], '<em>$1</em>');

		// 문자열 내에 code 요소가 있는지 확인하고 번역
		string = string.replace(this.regExpCode[0], '<code>$1</code>');
		string = string.replace(this.regExpCode[1], '<code>$1</code>');

		// 문자열 내에 참조 스타일의 img 요소가 있는지 확인하고 번역
		// 단 전체 내용 내에 대응대는 참조 정보가 없다면 번역되지 않는다.
		while((line = this.regExpImg.exec(string)) != null) {
			id = line[2] == "" ? line[1] : line[2];
			if(this.refId[id] != undefined){
				string = string.replace(this.regExpImg, '<img src="'+this.refId[id]['url']+'" alt="'+line[1]+'" title="'+this.refId[id]['title']+'">');
 			}
 		}

		// 문자열 내에 참조 스타일의 a 요소가 있는지 확인하고 번역
		// 단 전체 내용 내에 대응대는 참조 정보가 없다면 번역되지 않는다.
		while((line = this.regExpLink.exec(string)) != null) {
			id = line[2] == "" ? line[1] : line[2];
			if(this.refId[id] != undefined) {
				string = string.replace(this.regExpLink, '<a href="'+this.refId[id]['url']+'" title="'+this.refId[id]['title']+'">'+line[1]+'</a>');
 			}

 		}

		// 인라인 스타일의 img 요소가 있는지 확인하고 번역
		string = string.replace(this.regExpImgInline, '<img src="$2" alt="$1" title="$3">');

		// 인라인 스타일의 a 요소가 있는지 확인하고 번역
		string = string.replace(this.regExpLinkInline, '<a href="$2" title="$3">$1</a>');

		// url 스타일의 a 요소가 있는지 확인하고 번역
		string = string.replace(this.regExpLinkAuto, '<a href="$1">$1</a>');

		// br 요소가 있는지 확인하고 번역
		string = string.replace(this.regExpBreak, '<br/>');

		// 사용자가 추가적인 인라인 문법 번역 함수를 추가했다면 실행한다.
		if(this.additionalDecodeInline != null) {
			string = this.additionalDecodeInline(string);
		}

		string = string.replace(/<(?=[^>]*$)/g, '&lt;');

		while((line = string.match(this.regExpReturnEscape)) != null) {
			string = string.replace(line[0], this.replacerForEscapeCharacter[line[1]]);
		}

		return string;
	},

	// 해석한 줄들을 전체적으로 확인해 번역한다.
	// this.translate에서 바로 하지 않는 이유는
	// 전후 줄의 상태에 따라 번역이 달라질 수 있기 때문이다.
	decode: function() {
		var string = "", 
		    listNested = Array(),
		    nowQuotes = 0,
		    startP = false,
		    startList = false,
		    startCodeblock = false,
		    line, r, i, j, k, prev, next, above, below,
		    idxAbove, idxBelow, aboveIdxAbove, belowIdxBelow;

		// 줄 단위로 확인한다.
		for(i = 0; i < this.result.length; i++) {
			line = "";
			r = this.result[i];
			prev = this.previousLine(i);
			next = this.nextLine(i);
			above = this.aboveExceptBlank(i);
			below = this.belowExceptBlank(i);

			if(r.tag != this.P && startP) {
				line += "</p>";
				startP = false;
			}

			if(r.tag != this.CODEBLOCK && startCodeblock) {
				line += "</code></pre>";
				startCodeblock = false;
			}

			// blockquote, ul/ol/li 시작/종료 여부를 판단.
			if(r.tag != this.BLANK) {

				if(r.level != 0) {
					if(r.level < listNested.length) {
						for(j = listNested.length - 1; j >= r.level; j--) {
							line += "</li></" + listNested[j] + ">";
						}
						listNested = listNested.slice(0, r.level);

					} else if(above && r.quote < above.quote) {
						for(j = listNested.length - 1; j >= 0; j--) {
							line += "</li></" + listNested[j] + ">";
						}
						listNested = Array();

					} else if(r.level == listNested.length){
						if(r.tag == this.UL || r.tag == this.OL) {
							line += "</li>";
							if(r.tag != listNested[listNested.length - 1]) {
								line += "</" + listNested[listNested.length - 1] + ">";
							}
						}

					}
				}

				if(r.level == 0 && listNested.length != 0) {
					for(j = listNested.length - 1; j >= 0; j-- ) {
						line += "</li></" + listNested[j] + ">";
					}
					listNested = Array();
				}

				// blockquote의 시작/종료 여부를 판단.
				if(r.quote < nowQuotes && prev != null && prev.tag == this.BLANK) {
					for(j = 0; j < nowQuotes - r.quote; j++) {
						line += "</blockquote>"
					}
					nowQuotes = r.quote;
				} else if(r.quote > nowQuotes) {
					for(j = 0; j < r.quote - nowQuotes; j++) {
						line += "<blockquote>";
					}
					nowQuotes = r.quote;

				} 

				// ul/ol/li의 시작 여부를 판단.
				if(r.level != 0) {
					if(r.level > listNested.length) {
						k = r.level - listNested.length;
						for(j = 0; j < k; j++) {
							listNested[listNested.length] = r.tag;
							line += "<" + r.tag + "><li>";
						}
						startLI = true;

					} else {
						if(r.tag == this.UL || r.tag == this.OL) {
							if(r.level == listNested.length && r.tag != listNested[listNested.length - 1]) {
								line += "<" + r.tag + ">";
								listNested[listNested.length - 1] = r.tag;
							}
							line += "<li>";
							startLI = true;
						}
					}

					if(startLI && !startP && r.tag != this.CODEBLOCK) {
						if(next && below && next.tag == this.BLANK && below.level == r.level) {
							line += "<p>";
							startP = true;
						
						} else if(prev && above && prev.tag == this.BLANK && above.level == r.level) {
							line += "<p>";
							startP = true;
						}

						else {
							idxAbove = this.idxAboveThisList(i);
							aboveIdxAbove = this.aboveExceptBlank(idxAbove);
							idxBelow = this.idxBelowThisList(i);
							belowIdxBelow = this.belowExceptBlank(idxBelow);

							if(idxAbove && aboveIdxAbove && this.result[idxAbove].tag == this.BLANK && aboveIdxAbove.level == r.level) {
								line += "<p>";
								startP = true;

							} else if(idxBelow && belowIdxBelow && this.result[idxBelow].tag == this.BLANK && belowIdxBelow.level == r.level) {
								line += "<p>";
								startP = true;

							} else {
								for(j = i + 1; j < idxBelow; j++) {
									if(this.result[j].tag == this.P) {
										this.result[j].tag = undefined;
									}
								}
							}
						}
					}
				}
			}

			if(r.tag == this.CODEBLOCK) {
				r.child = r.child.replace(/[<>&]/g, function(whole) {
					switch(whole) {
						case '<': return '&lt;';
						case '>': return '&gt;';
						case '&': return '&amp;';
					}
				});
			} else {
				r.child = this.decodeInline(r.child);
			}

			switch(r.tag) {
				// 제목(h1, h2, h3, h4, h5, h6) 혹은 수평선(hr)일 때의 번역.
				// 내용이 짧은 관계로 붙여서 작성햇다.
				case this.H1:    line += "<h1>" + r.child + "</h1>"; break;
				case this.H2:    line += "<h2>" + r.child + "</h2>"; break;
				case this.H3:    line += "<h3>" + r.child + "</h3>"; break;
				case this.H4:    line += "<h4>" + r.child + "</h4>"; break;
				case this.H5:    line += "<h5>" + r.child + "</h5>"; break;
				case this.H6:    line += "<h6>" + r.child + "</h6>"; break;
				case this.HR:    line += "<hr/>"; break;
				case this.BLANK: line += "\n"; break;
				case this.P:
					if(!startP) {
						line += "<p>";
						startP = true;
					}
					line += r.child;
				break;

				case this.CODEBLOCK:
					if(!startCodeblock) {
						line += "<pre><code>";
						startCodeblock = true;
					}
					line += r.child + "\n";
				break;

				default: line += r.child; break;
			}
			//console.log(line);
			string += line;
		}

		$(this.targetSelector).html(string);
	}
} // RICALE.HMD.Decoder.prototype

RICALE.hmd = new RICALE.HMD.Decoder();