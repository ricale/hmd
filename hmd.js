// # project handmade markdown decoder (hmd)
//  - written by ricale
//  - version 0.2
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
	regExpImg: /!\[([^\]]+)\][\s]*\[([^\]]*)\]/,
	regExpLink: /\[([^\]]+)\][\s]*\[([^\]]*)\]/,
	regExpImgInline: /!\[([^\]]+)\][\s]*\(([^\s\)]+)(?: "(.*)")?\)/g,
	regExpLinkInline: /\[([^\]]+)\][\s]*\(([^\s\)]+)(?: "(.*)")?\)/g,
	regExpLinkAuto: /<(http[s]?:\/\/[^>]+)>/g,
	regExpCode: [
		/``[\s]*(.+?)[\s]*``/g,
		/`([^`]+)`/g
	],
	regExpBreak: /(  )$/,
	regExpEscape: /(\\([-_\*+\.>#]))/,
	regExpEscape2: /\{\\([-_\*+\.>#])\\\}/,

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
		this.init();

		// 타겟 요소의 문자열을 줄 단위로 끊어 배열로 저장한다.
		var array = sourceString.split(/\n/);

		// 한 줄 한 줄이 어떤 마크다운에 해당하는 지 체크한다.
		for(var i = 0, now = 0; i < array.length; i++) {

			var result = this.match(array[i], now);

			// 참조 스타일의 링크/이미지 기능을 위한 참조 문자열이었다면
			// 실제로 보이는 문자열이 아니므로 지나친다.
			if(result == null) {
				continue;
			}

			this.result[now] = result;

			// 이전까지 목록 요소들이었다가
			// 현재 줄에서 목록 요소가 아니게 되면 목록 관련 계산 배열을 초기화한다.
			if(this.listLevel.length > 0 
				&& this.result[now].tag != this.BLANK
				&& this.result[now].level == 0) {
				this.listLevel = Array();
			    this.listLevelInBlockquote = Array();
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
		    isContinuedList = false;

		// 빈 줄인지 확인한다.
		line = result.child.match(this.regExpBlank);
		if(line != null) {
			result.tag   = this.BLANK;
			result.child = "";
			return result;
		}

		// 밑줄 스타일의 H1 문법인지 확인한다.
		// 만약 맞다면 이 줄 자체는 아무런 의미가 없기 때문에 null을 반환한다.
		line = result.child.match(this.regExpH1Underlined);
		if(line != null && now != 0 && this.result[now - 1].tag == this.P) {
			this.result[now - 1].tag = this.H1;
			return null;
		}

		// 밑줄 스타일의 H2 문법인지 확인한다.
		// 만약 맞다면 이 줄 자체는 아무런 의미가 없기 때문에 null을 반환한다.
		line = result.child.match(this.regExpH2Underlined);
		if(line != null && now != 0 && this.result[now - 1].tag == this.P) {
			this.result[now - 1].tag = this.H2;
			return null;
		}

		// hR 문법인지 확인한다.
		line = result.child.match(this.regExpHR);
		if(line != null) {
			result.tag   = this.HR;
			result.child = "";
			return result;
		}

		// UL 문법인지 확인한다.
		// 모양만 유사한 코드 블록일 가능성도 있다.
		line = result.child.match(this.regExpUL);
		if(line != null) {
			var r = this.isThisReallyListElement(this.UL, line, result);
			if(r !== false) {
				return r;
			} else {
				line = result.child.match(this.regExpCodeblock);
				return this.getCodeblockResult(line, result);
			}
		}

		// OL 문법인지 확인한다.
		// 모양만 유사한 코드 블록일 가능성도 있다.
		line = result.child.match(this.regExpOL);
		if(line != null) {
			var r = this.isThisReallyListElement(this.OL, line, result);
			if(r !== false) {
				return r;
			} else {
				line = result.child.match(this.regExpCodeblock);
				return this.getCodeblockResult(line, result);
			}
		}

		// 목록 요소에서 이어지는 블록 요소인지 확인한다.
		// 다른 요소 확인 때는 인용 블록 요소를 체크한 결과(result.child)를 이용해 확인하지만,
		// 여기서 만큼은 원본 문자열(string)로 확인한다.
		isContinuedList = this.matchContinuedList(string, now, result);
		if(isContinuedList != false) {
			return isContinuedList;
		}

		// 제목(h1, h2, h3, h4, h5, h6) 문법인지 확인한다.
		line = result.child.match(this.regExpHeading);
		if(line != null) {
			var headingLevel = line[1].length;

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
		line = result.child.match(this.regExpReferencedId[0]);
		if(line == null) {
			line = result.child.match(this.regExpReferencedId[1]);
		}
		if(line != null) {
			this.refId[line[1]] = new RICALE.HMD.ReferencedId(line[2], line[3]);
			return null;
		}

		// 코드블록(pre code) 문법인지 확인한다.
		line = result.child.match(this.regExpCodeblock);
		if(line != null) {
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
		    levels = isInBq ? this.listLevelInBlockquote : this.listLevel;

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
			var now = levels.length;

			if(space >= (now + 1) * 4) {
				result.tag = this.P;
				result.level = now;

			} else if(space > levels[now - 1] && space > (now - 1) * 4) {
				levels[now] = space;

				result.level = now + 1;

			} else if(space >= levels[now - 1]) {
				result.level = now;

			} else {
				var exist = false;
				for(var i = now - 2; i >= 0 ; i--) {
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

		return result;
	},

	// 들여쓰기(blank)가 몇 개의 공백(space)인지 확인해 결과를 반환한다.
	// 탭(tab) 문자는 4개의 공백으로 계산한다.
	getIndentLevel: function(blank) {
		var indent = blank.match(/([ ]{0,3}\t|[ ]{4}|[ ]{1,3})/g),
		    space = 0;

		if(indent != null) {
			for(var i = 0; i < indent.length; i++) {
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
		    line = string.match(this.regExpContinuedList);

		// 1. 빈 줄을 포함한 바로 윗 줄이 존재하는 가운데,
		// 2. 그 윗줄의 목록 요소 레벨이 0이 아니라면
		// (=> 목록 요소가 계속 이어지고 있다면)
		// 이 줄은 목록 요소 내부의 문단 요소이다.
		if(prev != null && prev.level != 0) {

			// a
		   	if(line != null && prev.tag == this.CODEBLOCK && this.getIndentLevel(line[1]) == 8) {
		   		if((this.listLevel.length - 1) * 4 <= this.getIndentLevel(line[2])) {
		   			result.tag = this.CODEBLOCK;
					result.child = line[2].slice((this.listLevel.length - 1) * 4) + line[3];
					result.level = this.listLevel.length;
					result.quote = last.quote;

					return result;
		   		}
		   	}

			result = this.matchBlockquotes(string);
			result.tag = this.P;
			result.level = this.listLevel.length;

			return result;

		// 1. 빈 줄을 제외한 바로 윗 줄이 존재하고,
		// 2. 그 줄의 목록 요소 레벨이 0이 아니고
		// (=> 바로 윗 줄은 공백이 최소 한 줄 있으며, 그 공백들 바로 위의 문장은 목록 요소가 이어지는 중이었다면)
		// 3. 또, 목록 내부의 문단 요소로써 문법도 일치한다면
		// 이것은
		//   a. 목록 요소 내부의 코드 블록이거나
		//   b. 목록 요소 내부의 인용 블록이거나
		//   c. 목록 요소 내부의 문단 요소이다.
		} else if(above != null && above.level != 0 && line !== null) {

			// a
		   	if(this.getIndentLevel(line[1]) == 8) {
		   		if((this.listLevel.length - 1) * 4 <= this.getIndentLevel(line[2])) {
		   			result.tag = this.CODEBLOCK;
					result.child = line[2].slice((this.listLevel.length - 1) * 4) + line[3];
					result.level = this.listLevel.length;
					result.quote = last.quote;

					return result;
		   		}
		   	}

		   	// b 혹은 c
			result = this.match(line[3]);
			var indent = this.getIndentLevel(line[1] + line[2]);
			indent = indent / 4 - indent / 4 % 1 + (indent % 4 != 0);

			result.level += indent > this.listLevel.length ? this.listLevel.length : indent;

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
				return i;
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
				return i;
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
		string = string.replace(this.regExpEscape, '{$1\\}');

		// 문자열 내에 strong 요소가 있는지 확인하고 번역
		string = string.replace(this.regExpStrong[0], '<strong>$1</strong>');
		string = string.replace(this.regExpStrong[1], '<strong>$1</strong>');
		
		// 문자열 내에 em 요소가 있는지 확인하고 번역
		string = string.replace(this.regExpEM[0], '<em>$1</em>');
		string = string.replace(this.regExpEM[1], '<em>$1</em>');

		// 문자열 내에 code 요소가 있는지 확인하고 번역
		for(var i = 0; i < this.regExpCode.length; i++) {
			string = string.replace(this.regExpCode[i], '<code>$1</code>');
		}

		// 문자열 내에 참조 스타일의 img 요소가 있는지 확인하고 번역
		// 단 전체 내용 내에 대응대는 참조 정보가 없다면 번역되지 않는다.
		while(true) {
			var line = string.match(this.regExpImg);

			if(line == null) {
				break;
			}

			var id = line[2] == "" ? line[1] : line[2];
			if(this.refId[id] == undefined){
				break;
			}

			if(this.refId[id]['title'] != null) {
				string = string.replace(this.regExpImg, '<img src="' + this.refId[id]['url'] + '" alt="' + line[1]
					                    + '" title="' + this.refId[id]['title'] + '">');
			} else {
				string = string.replace(this.regExpImg, '<img src="' + this.refId[id]['url'] + '" alt="' + line[1] + '">');
			}
		}

		// 문자열 내에 참조 스타일의 a 요소가 있는지 확인하고 번역
		// 단 전체 내용 내에 대응대는 참조 정보가 없다면 번역되지 않는다.
		while(true) {
			var line = string.match(this.regExpLink);

			if(line == null) {
				break;
			}
			
			var id = line[2] == "" ? line[1] : line[2];
			if(this.refId[id] == undefined) {
				break;
			}

			if(this.refId[id]['title'] != null) {
				string = string.replace(this.regExpLink, '<a href="' + this.refId[id]['url'] + '" title="' + this.refId[id]['title'] + '">'
				                        + line[1] + '</a>');
			} else {
				string = string.replace(this.regExpLink, '<a href="' + this.refId[id]['url'] + '">' + line[1] + '</a>');
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

		string = string.replace(this.regExpEscape2, '$1');

		// 사용자가 추가적인 인라인 문법 번역 함수를 추가했다면 실행한다.
		if(this.additionalDecodeInline != null) {
			string = this.additionalDecodeInline(string);
		}

		return string;
	},

	// 해석한 줄들을 전체적으로 확인해 번역한다.
	// this.translate에서 바로 하지 않는 이유는
	// 전후 줄의 상태에 따라 번역이 달라질 수 있기 때문이다.
	decode: function() {
		var string = "",
		    // li 태그가 시작된 상태인가
		    beginLI = false,
		    // p 태그가 시작된 상태인가
		    beginP = false,
		    // 코드블록(pre태그와 code태그의 중첩)이 시작된 상태인가.
		    beginCodeblock = false,
		    // 인용 블록의 현재 중첩 레벨
		    blockquoteLevel = 0,
		    // 중첩된 목록 요소의 순서 스택 (ul/ol)
		    listElements = Array();

		// 줄 단위로 확인한다.
		for(var i = 0; i < this.result.length; i++) {
			var line = "";
			    r = this.result[i],
			    above = this.aboveExceptBlank(i),
			    prev = this.previousLine(i),
			    below = this.belowExceptBlank(i),
			    next = this.nextLine(i);

			// 코드블록이라면 내부의 인라인 요소를 번역할 필요가 없다.
			if(r.tag != this.CODEBLOCK) {
				r.child = this.decodeInline(r.child);
			}

			// 인용이 있고 이전 줄의 인용보다 레벨이 높다면
			// 높은 레벨 만큼 <blockquote> 태그를 추가한다.
			if(r.quote > 0 && r.quote > blockquoteLevel) {
				for(var j = 0; j < r.quote - blockquoteLevel; j++) {
					line += "<blockquote>";
				}

				blockquoteLevel = r.quote;
			}


			switch(r.tag) {
				// 제목(h1, h2, h3, h4, h5, h6) 혹은 수평선(hr)일 때의 번역.
				// 내용이 짧은 관계로 붙여서 작성햇다.
				case this.H1: line += "<h1>" + r.child + "</h1>"; break;
				case this.H2: line += "<h2>" + r.child + "</h2>"; break;
				case this.H3: line += "<h3>" + r.child + "</h3>"; break;
				case this.H4: line += "<h4>" + r.child + "</h4>"; break;
				case this.H5: line += "<h5>" + r.child + "</h5>"; break;
				case this.H6: line += "<h6>" + r.child + "</h6>"; break;
				case this.HR: line += "<hr/>"; break;

				// 빈 줄일 때의 번역.
				case this.BLANK:

					// 윗 줄이 코드블록이었거나 현재 인용 요소가 존재하고 있다면 공백도 내용에 추가한다.
					if((above != null && below != null && above.tag == this.CODEBLOCK && below.tag == this.CODEBLOCK)
						|| r.quote != 0) {
						line += r.child;
					}

					break;

				// 목록(ul, ol)일 때의 번역.
				case this.UL:
				case this.OL:
					// 목록 레벨이 이전보다 높아졌다면 높아진 만큼 <ol> 혹은 <ul> 추가
					if(listElements.length < r.level) {
						for(var j = listElements.length; j < r.level; j++) {
							listElements[j] = r.tag;
							line += listElements[j] == this.UL ? "<ul>" : "<ol>";
						}
					}

					line += "<li>";
					beginLI = true;

					var idxAboveList = this.idxAboveThisList(i),
					    idxBelowList = this.idxBelowThisList(i);

					// a. 1. 현재 목록 블록이 끝나고 난 후의 줄이 존재 하고 그 줄이 빈 줄일 때
					//    2. 그 다음 줄이 존재하고 그 줄이 목록 블록일 때
					// b. 1. 현재 목록 블록이 시작하기 전의 줄이 존재하고 그 줄이 빈 줄일때
					//    2. 그 전 줄이 존재하고 그 줄이 목록 블록일 때
					// 이 목록 요소의 내부는 문단 요소이다.
					if((idxBelowList != null && this.result[idxBelowList].tag == this.BLANK	&& idxBelowList + 1 < this.result.length
					                         && this.result[idxBelowList + 1].level == r.level)
						|| (idxAboveList != null && this.result[idxAboveList].tag == this.BLANK && idxAboveList - 1 >= 0
						                         && this.result[idxAboveList - 1].level == r.level)) {

						line += "<p>" + r.child;
						beginP = true;

						// 다음 줄도 문단 요소가 아니라면 바로 닫는다.
						if(next == null || next.tag != this.P) {
							line += "</p>";
							beginP = false;
						}

					} else {
						line += r.child;
					}

					break;

				// 코드 블록(pre와 code의 중첩)일 때의 번역.
				case this.CODEBLOCK:
					// 코드블록이 시작하지 않은 가운데 코드블록 요소가 나왔다면 <pre><code> 추가
					if(!beginCodeblock) {
						line += "<pre><code>";
						beginCodeblock = true;
					}

					line += r.child + "\r\n";

					// a. 1. 현재 목록 레벨이 0이고 (목록 요소 내부이고)
					//    2. a. 공백을 포함한 바로 아랫 줄이 존재하지 않거나
					//       b. 존재하지만 그 줄이 코드블록이 아니거나
					//       c. 그 줄의 인용 블록 레벨이 현재 줄 보다 크다면
					// b. 1. 현재 목록 레벨이 0이 아니고 (목록 요소 외부이고)
					//    2. a. 공백을 제외한 다음 줄이 존재하지 않거나
					//       b. 존재하지만 그 줄이 코드 블록이 아니라면
					// 코드 블록을 닫는다.
					if((r.level == 0 && (below == null || below.tag != this.CODEBLOCK || below.quote > r.quote))
						|| (r.level != 0 && (next == null || next.tag != this.CODEBLOCK))) {
						line += "</code></pre>"
						beginCodeblock = false;
					}

					break;

				// 목록(p)일 때의 번역.
				case this.P:
					// 문단이 시작하지 않고 목록아이템 요소도 시작하지 않은 가운데 목록 요소가 나왔다면 <p> 추가
					if(!beginP && !beginLI) {
						line += "<p>";
						beginP = true;
					}

					line += r.child;

					// 문단이 시작된 상태에서
					if(beginP) {
						// a. 1. 현재 목록 레벨이 0이고 (목록 요소 내부이고)
						//    2. a. 공백을 포함한 바로 아랫 줄이 존재하지 않거나
						//       b. 존재하지만 그 줄이 문단이 아니거나
						//       c. 그 줄의 인용 블록 레벨이 현재 줄 보다 크다면
						// b. 1. 현재 목록 레벨이 0이 아니고 (목록 요소 외부이고)
						//    2. a. 공백을 제외한 다음 줄이 존재하지 않거나
						//       b. 존재하지만 그 줄이 문단이 아니라면
						// 문단을 닫는다.
						if((r.level == 0 && (next == null || next.tag != this.P || below.quote > r.quote))
							|| (r.level != 0 && (next == null || next.tag != this.P))) {
							line += "</p>";
							beginP = false;
						}
					}
					break;

				default:
					line += r.child;
					break;
			}


			// 1. li가 열린 상태에서
			// 2. a. 공백을 제외한 다음 줄이 존재하지 않거나
			//    b. 존재하지만 그 줄의 목록 레벨이 0이거나 (목록 블록이 끝났거나)
			//    c. 1. 그 줄의 목록 레벨이 현재 목록 레벨보다 작거나 같은데
			//       2. 그 줄이 OL이거나 OL이라면
			// li를 닫는다.
			if(beginLI && (below == null || below.level == 0 || (below.level <= r.level) && (below.tag == this.UL || below.tag == this.OL))) {
				line += "</li>";
				beginLI = false;
			}

			// 목록 레벨이 이전보다 낮아졌다면 낮아진 만큼 목록 요소를 닫는다.
			var level = below != null ? below.level : 0;
			if(listElements.length > level) {
				if(beginLI) {
					line += "</li>";
					beginLI = false;
				}

				for(var j = listElements.length - 1; j >= level; j--) {
					line += listElements[j] == this.UL ? "</ul>" : "</ol>";
				}
				listElements = listElements.slice(0, level);
			}

			// a. 빈 줄을 제외한 아래 줄이 없거나 (마지막 줄이거나)
			// b. 1. 존재하지만 그 줄이 이 줄 인용보다 레벨이 낮고 
			//    2. 빈 줄을 포함한 바로 아래 줄이 빈 줄이며 인용 레벨이 0이라면
			// 인용 블록을 닫는다.
			if(below == null || (below.quote < blockquoteLevel && (next.tag == this.BLANK && next.quote == 0))) {
				var quote = below != null ? below.quote : 0
				for(var j = 0; j < blockquoteLevel - quote; j++) {
					line += "</blockquote>";
				}

				blockquoteLevel = quote;
			}

			string += line;
		}

		$(this.targetSelector).html(string);
	}
} // RICALE.HMD.Decoder.prototype

RICALE.hmd = new RICALE.HMD.Decoder();