// # project handmade markdown decoder (hmd)
//  - written by ricale
//  - version 0.2.1
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
	H1U: "h1u",
	H2U: "h2u",
	HR: "hr",
	UL: "ul",
	OL: "ol",
	BLANK: "blank",
	CODEBLOCK: "codeblock",
	BLOCKQUOTE: "blockquote",

	// ### 블록 요소 마크다운의 정규 표현식들

	// 반드시 지켜져야 할 해석 순서
	// Blockquote > Heading Underlined > HR > (UL, OL, ContinuedList) > (Codeblock, Heading, ReferencedId)
	// Blank > Codeblock

	regExpHeading: /^(#{1,6}) (.*[^#])(#*)$/,
	regExpH1Underlined: /^=+$/,
	regExpH2Underlined: /^-+$/,
	regExpBlockquote: /^(>[ ]?)+ (.*)$/,
	regExpHR: /^([-_*]+)[ ]*\1[ ]*\1[ ]*$/,
	regExpUL: /^[*+-][ ]+(.*)$/,
	regExpOL: /^[\d]+\.[ ]+(.*)$/,
	regExpBlank: /^[\s]*$/,
	regExpContinuedList: /^([\s]{1,8})([\s]*)(.*)/,
	regExpCodeblock: /^([ ]{0,3}\t|[ ]{4})([\s]*.*)$/,
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
		var array = sourceString.split(/\n/),
		    i, now, result;

		// 한 줄 한 줄이 어떤 마크다운에 해당하는 지 체크한다.
		for(i = 0, now = 0; i < array.length; i++) {
			result = this.match(array[i]);

			if(result != false) {
				if(result.grammar[result.grammar.length - 1] == this.H1U && result.grammar.length == this.result[now-1].grammar.length + 1) {
					this.result[now-1].grammar.push(this.H1);
				} else if(result.grammar[result.grammar.length - 1] == this.H1U && result.grammar.length == this.result[now-1].grammar.length + 1) {
					this.result[now-1].grammar.push(this.H2);
				} else {
					this.result[now] = result;
					now += 1;
				}
			}
		}

		// 줄 단위로 해석한 것을 통합해서 번역한다.
		this.decode();
	},

	// 번역 시 필요한 정보를 초기화한다.
	init: function() {
		this.result = Array();
		this.refId = {};
		this.listLevel = Array();
	},

	// 문자열(string)에 어떤 마크다운 문법 (블록 요소 기준) 이 적용되었는지 확인한다.
	// 문자열의 줄번호(now)는, 어떠한 마크다운 문법과도 매치되지 않는 문장일 경우
	// 목록 요소로부터 늘어진 블록 요소인지 확인하기 위해 쓰인다.
	// RICALE.HMD.MarkdownSentence 객체를 반환한다.
	match: function(string) {
		var separated = {
			'grammar' : Array(),
			'string'  : string
		}, result;

		if((result = this.matchHeading(separated)) != null) {
			return result;
		}

		do {
			separated = this.separateIndent(separated);

			if((result = this.matchHeading(separated)) != null) {
				console.log(result.grammar, result.string);
				return result;
			}

			if((result = this.separateBlockElements(separated)) != null && result != false) {
				separated = result;
			}

		} while(result != null && result != false);

		return result == false ? false : separated;

	}, // end function match

	// 들여쓰기(blank)가 몇 개의 공백(space)인지 확인해 결과를 반환한다.
	// 탭(tab) 문자는 4개의 공백으로 계산한다.
	separateIndent: function(separated) {
		var string, indent, space = 0, i;

		if((string = separated.string.match(/^([ \t]*)(?=[^ \t])(.*)$/)) == null) {
			separated.grammar.push(this.BLANK);
			return separated;
		}

		if((indent = string[1].match(/([ ]{0,3}\t|[ ]{4}|[ ]{1,3})/g)) != null) {
			for(i = 0; i < indent.length; i++) {
				space += indent[i].match(/^[ ]{1,3}$/) != null ? indent[i].length : 4;
			}
		}

		if(space != 0) {
			separated.grammar.push(space);
		}
		separated.string = string[2];

		return separated;
	},

	matchHeading: function(separated) {
		var string = separated.string;

		// 제목(h1, h2, h3, h4, h5, h6) 문법인지 확인한다.
		if((line = string.match(this.regExpHeading)) != null) {
			headingLevel = line[1].length;

			switch(headingLevel) {
				case 1: separated.grammar.push(this.H1); break;
				case 2: separated.grammar.push(this.H2); break;
				case 3: separated.grammar.push(this.H3); break;
				case 4: separated.grammar.push(this.H4); break;
				case 5: separated.grammar.push(this.H5); break;
				case 6: separated.grammar.push(this.H6); break;
			}

			separated.string = line[2];
			return separated;
		}

		// 밑줄 스타일의 H1 문법인지 확인한다.
		// 만약 맞다면 이 줄 자체는 아무런 의미가 없기 때문에 null을 반환한다.
		if((line = string.match(this.regExpH1Underlined)) != null) {
			separated.grammar.push(this.H1U);
			return separated;
		}

		// 밑줄 스타일의 H2 문법인지 확인한다.
		// 만약 맞다면 이 줄 자체는 아무런 의미가 없기 때문에 null을 반환한다.
		if((line = string.match(this.regExpH2Underlined)) != null) {
			separated.grammar.push(this.H2U);
			return separated;
		}

		return null;
	},

	separateBlockElements: function(separated) {
		var line;

		
		if((line = separated.string.match(this.regExpBlockquote)) != null) {
			separated.grammar.push(this.BLOCKQUOTE + line[1].match(/>/).length);
			separated.string = line[2];
			return separated;
		}

		// hR 문법인지 확인한다.
		if((line = separated.string.match(this.regExpHR)) != null) {
			separated.grammar.push(this.HR);
			separated.string = "";
			return separated;
		}

		// UL 문법인지 확인한다.
		// 모양만 유사한 코드 블록일 가능성도 있다.
		if((line = separated.string.match(this.regExpUL)) != null) {
			separated.grammar.push(this.UL);
			separated.string = line[1];
			return separated;
		}

		if((line = separated.string.match(this.regExpOL)) != null) {
			separated.grammar.push(this.OL);
			separated.string = line[1];
			return separated;
		}

		// 참조 스타일의 이미지/링크 요소를 위한 참조 문자열 문법인지 확인한다.
		if((line = separated.string.match(this.regExpReferencedId[0])) != null
		   || (line = separated.string.match(this.regExpReferencedId[1])) != null) {
			this.refId[line[1]] = new RICALE.HMD.ReferencedId(line[2], line[3] ? line[3] : "");
			return false;
		}

		return null;
	},

	getListLevel: function(space, nested) {
		// 이 줄의 들여쓰기가 몇 개의 공백으로 이루어져있는지 확인한다.
		var result = new RICALE.HMD.TranslateSentence(),
		    levels, now, exist, i;

		console.log("space", space);

		if(this.listLevel[nested] == undefined) {
			this.listLevel[nested] = Array();
		}

		levels = this.listLevel[nested];

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

		this.listLevel[nested] = levels;

		for(i = nested+1; i < this.listLevel.length; i++) {
			this.listLevel[i] = Array();
		}

		return result.level;
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
		var string = "", line, r, listNested = Array(), nowQuotes = 0, startP = false, startCodeblock = false, i, j, k, level;

		// 줄 단위로 확인한다.
		for(i = 0; i < this.result.length; i++) {
			line = "";
			level = 0;
			r = this.result[i];
			r.string = this.decodeInline(r.string);

			if(typeof(r.grammar[0]) == "number") {
				if(r.grammar[1] == this.OL || r.grammar[1] == this.UL) {
					level = this.getListLevel(r.grammar[0], 0);
				}

				tag = r.grammar[1];
			} else {
				if(r.grammar[0] == this.OL || r.grammar[0] == this.UL) {
					level = this.getListLevel(0, 0);
				}

				tag = r.grammar[0];
			}

			console.log(r.grammar, tag, level, r.string);


			if(tag != undefined && startP) {
				line += "</p>";
				startP = false;
			}

			if(tag != this.CODEBLOCK && startCodeblock) {
				line += "</code></pre>";
				startCodeblock = false;
			}

			// blockquote, ul/ol/li 시작/종료 여부를 판단.
			if(tag != this.BLANK) {

				if(level != 0) {
					if(level < listNested.length) {
						for(j = listNested.length - 1; j >= level; j--) {
							line += "</li></" + listNested[j] + ">";
						}
						listNested = listNested.slice(0, level);
					} else if(level == listNested.length){
						if(tag == this.UL || tag == this.OL) {
							line += "</li>";
							if(tag != listNested[listNested.length - 1]) {
							    line += "</" + listNested[listNested.length - 1] + ">";
							}
						}
					}
				}

				if(level == 0 && listNested.length != 0) {
					for(j = listNested.length - 1; j >= 0; j-- ) {
						line += "</li></" + listNested[j] + ">";
					}
					listNested = Array();
				}

				// blockquote의 시작/종료 여부를 판단.
				if(r.quote < nowQuotes) {
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
				if(level != 0) {
					if(level > listNested.length) {
						k = level - listNested.length;
						for(j = 0; j < k; j++) {
							listNested[listNested.length] = tag;
							line += "<" + tag + "><li>";
						}

					} else {
						if(tag == this.UL || tag == this.OL) {
							if(level == listNested.length && tag != listNested[listNested.length - 1]) {
							    line += "<" + tag + ">";
							        listNested[listNested.length - 1] = tag;
							    }
							    line += "<li>";
							}
						}
					}
				}

				switch(tag) {
				// 제목(h1, h2, h3, h4, h5, h6) 혹은 수평선(hr)일 때의 번역.
				// 내용이 짧은 관계로 붙여서 작성햇다.
				case this.H1:    line += "<h1>" + r.string + "</h1>"; break;
				case this.H2:    line += "<h2>" + r.string + "</h2>"; break;
				case this.H3:    line += "<h3>" + r.string + "</h3>"; break;
				case this.H4:    line += "<h4>" + r.string + "</h4>"; break;
				case this.H5:    line += "<h5>" + r.string + "</h5>"; break;
				case this.H6:    line += "<h6>" + r.string + "</h6>"; break;
				case this.HR:    line += "<hr/>"; break;
				case this.BLANK: line += "\n"; break;
				case this.CODEBLOCK:
					if(!startCodeblock) {
						line += "<pre><code>";
						startCodeblock = true;
					}
					line += r.string;
					break;

				case undefined:
					if(!startP) {
						line += "<p>";
						startP = true;
					}
					line += r.string;
					break;

				default: line += r.string; break;
			}

			if((this.listLevel.length > 0)
				&& tag != this.BLANK
				&& level == 0) {
				this.listLevel[0] = Array();
			}

			string += line;
		}
		$(this.targetSelector).html(string);
	}
} // RICALE.HMD.Decoder.prototype

RICALE.hmd = new RICALE.HMD.Decoder();