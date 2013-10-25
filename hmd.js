// # project handmade markdown decoder (hmd)
//  - written by ricale
//  - version 0.2.2
//  - ricale@hanmail.net or kim.kangseong@gmail.com

// ## 사용법
// RICALE.hmd.run(sourceTextareaSelector, targetElementSelector)
// 상세 정보는 git 저장소(https://bitbucket.org/ricale/handmade-markdown-decoder)
//  혹은 comfycastle 블로그 글(http://comfycastle.net/blog/136) 참고

if(typeof(RICALE) == typeof(undefined)) {
    var RICALE = {};
}

RICALE.HMD = {};

RICALE.HMD.TranslateSentence = function() {
    // 이 문장의 실제 내용 (string)
    this.content = null;
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

    // 문장 별 해석 결과(RICALE.HMD.TranslateSentence)의 배열
    this.result = Array();

    // 참조 스타일의 이미지/링크 요소 사용 시 참조 정보를 담은 해시.
    // (key:아이디) - (value:RICALE.HMD.ReferenceId 의 객체) 형식이다.
    this.refId = {};

    // 목록 요소의 레벨 계산을 위한 (정수) 배열
    this.listLevel = Array();
    this.listLevelInBlockquote = Array();
}

RICALE.HMD.Decoder.prototype

RICALE.HMD.Decoder.prototype = (function() {
    var targetSelector, additionalDecodeInline,

    // 어떤 마크다운 문법이 적용되었는지 구분할 때 쓰일 구분자들 (string) 
    P = "p",
    H1 = "h1",
    H2 = "h2",
    H3 = "h3",
    H4 = "h4",
    H5 = "h5",
    H6 = "h6",
    HR = "hr",
    UL = "ul",
    OL = "ol",
    BLANK = "blank",
    CODEBLOCK = "codeblock",

    // ### 블록 요소 마크다운의 정규 표현식들

    // 반드시 지켜져야 할 해석 순서
    // Blockquote > Heading Underlined > HR > (UL, OL, ContinuedList) > (Codeblock, Heading, ReferencedId)
    // Blank > Codeblock

    regExpBlockquote = /^[ ]{0,3}(>+) ([ ]*.*)$/,
    regExpH1Underlined = /^=+$/,
    regExpH2Underlined = /^-+$/,
    regExpHR = /^[ ]{0,3}([-_*]+)[ ]*\1[ ]*\1[ ]*$/,
    regExpUL = /^([\s]*)[*+-][ ]+(.*)$/,
    regExpOL = /^([\s]*)[\d]+\.[ ]+(.*)$/,
    regExpBlank = /^[\s]*$/,
    regExpContinuedList = /^([\s]{1,8})([\s]*)(.*)/,
    regExpCodeblock = /^([ ]{0,3}\t|[ ]{4})([\s]*.*)$/,
    regExpHeading = /^(#{1,6}) (.*[^#])(#*)$/,
    regExpReferencedId = [
        /^[ ]{0,3}\[([^\]]+)\]:[\s]*<([^\s>]+)>[\s]*(?:['"(](.*)["')])?$/,
        /^[ ]{0,3}\[([^\]]+)\]:[\s]*([^\s]+)[\s]*(?:['"(](.*)["')])?$/
    ],

    // ### 인라인 요소 마크다운의 정규 표현식들

    // 반드시 지켜져야 할 해석 순서
    // - Strong > EM
    // - Img > Link
    // - ImgInline > LineInline

    regExpStrong = [
        /\*\*([^\*\s]{1,2}|\*[^\*\s]|[^\*\s]\*|(?:[^\s].+?[^\s]))\*\*/g,
        /__([^_\s]{1,2}|_[^_\s]|[^_\s]_|(?:[^\s].+?[^\s]))__/g
    ],
    regExpEM = [
        /\*([^\*\s]{1,2}|[^\s].+?[^\s])\*/g,
        /_([^_\s]{1,2}|[^\s].+?[^\s])_/g
    ],
    regExpImg = RegExp(/!\[([^\]]+)\][\s]*\[([^\]]*)\]/g),
    regExpLink = RegExp(/\[([^\]]+)\][\s]*\[([^\]]*)\]/g),
    regExpImgInline = /!\[([^\]]+)\][\s]*\(([^\s\)]+)(?: "(.*)")?\)/g,
    regExpLinkInline = /\[([^\]]+)\][\s]*\(([^\s\)]+)(?: "(.*)")?\)/g,
    regExpLinkAuto = /<(http[s]?:\/\/[^>]+)>/g,
    regExpCode = [
        /``[\s]*(.+?)[\s]*``/g,
        /`([^`]+)`/g
    ],
    regExpBreak = /(  )$/,
    regExpEscape = /\\([-_\*+\.>#\[\]\(\)`])/,
    regExpReturnEscape = /\\EC([1-9A-C])\\/,

    replacerForEscapeCharacter = {
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

    // ### private method

    translate = function(sourceString) {
        var array = sourceString.split(/\n/), i, now, result,

        initAll = function() {
            this.result = Array();
            this.refId = {};
            this.listLevel = Array();
            this.listLevelInBlockquote = Array();
        },

        isEndOfList = function(result) {
            return result.tag != BLANK && result.level == 0
        },

        cleanListInformation = function() {
            if(this.listLevel.length > 0) {
                this.listLevel = Array();
                this.listLevelInBlockquote = Array();
            }

            if(this.listLevelInBlockquote.length > 0) {
                this.listLevelInBlockquote = Array();
            }
        };

        initAll();

        now = 0
        for(i = 0; i < array.length; i++) {
            if((result = matching(array[i], now)) == null) {
                continue;
            }

            this.result[now] = result;

            if(isEndOfList(this.result[now])) {
                cleanListInformation()
            }

            now++;
        }


            console.log(additionalDecodeInline)

        decode();
    },

    
    matching = function(string, now) {
        var sentence = matchBlockquotes(string), line = null, result,

        isBlank = function() {
            return sentence.content.match(regExpBlank) != null;
        },

        isUnderlineForH1 = function() {
            return sentence.content.match(regExpH1Underlined) != null && now != 0 && this.sentence[now - 1].tag == P
        },

        isUnderlineForH2 = function() {
            return sentence.content.match(regExpH2Underlined) != null && now != 0 && this.sentence[now - 1].tag == P
        },

        isHR = function() {
            return sentence.content.match(regExpHR) != null
        },

        matchWithListForm = function(tag, regExpTag) {

            var isThisReallyListElement = function(line) {

                var getListLevel = function(blank, isInBq) {
                    // 이 줄의 들여쓰기가 몇 개의 공백으로 이루어져있는지 확인한다.
                    var space = getIndentLevel(blank),
                        result = new RICALE.HMD.TranslateSentence(),
                        levels = isInBq ? this.listLevelInBlockquote : this.listLevel,
                        now, exist, i,

                    noListBefore = function() {
                        return levels.length == 0;
                    },

                    listExistWithOnlyOneLevel = function() {
                        return levels.length == 1;
                    },

                    indentIsSameAsFirstLevelOfList = function() {
                        return space == levels[0];
                    },

                    isParagraphInPrevListItem = function() {
                        return space >= (now + 1) * 4;
                    },

                    isNextLevelOfPrevListItem = function() {
                        return space > levels[now - 1] && space > (now - 1) * 4
                    },

                    isSameLevelOfPrevListItem = function() {
                        return space >= levels[now - 1];
                    };


                    if(noListBefore()) {
                        if(space <= 3) {
                            levels[0] = space;
                            result.level = 1;

                        } else {
                            result.tag = CODEBLOCK;
                        }


                    } else if(listExistWithOnlyOneLevel()) {
                        if(indentIsSameAsFirstLevelOfList()) {
                            result.level = 1;

                        } else if(space <= 7) {
                            levels[1] = space;
                            result.level = 2;

                        } else {
                            result.tag = CODEBLOCK;
                        }

                    // 현재 목록 레벨이 2 이상 존재하는 상황에서
                    // a. 공백이 (현재 목록 레벨 + 1) * 4 보다 크면 이 줄은 전 줄의 목록 요소에서 이어지는 문단 요소이다.
                    // b. 공백이 현재 목록 레벨의 공백보다 크고, (현재 목록 레벨 - 1) * 4 보다도 크면 이 줄은 현재 목록 레벨 + 1이다.
                    // c. a, b에 포함되지 않고, 현재 목록 레벨의 공백보다 크거나 같으면 이 줄의 목록 레벨은 현재 목록 레벨과 동일하다.
                    // d. a, b, c에 포함되지 않고, 현재 목록 레벨 이 전의 특정 목록 레벨보다 크거나 같다면 이 줄의 목록 레벨은 해당 목록 레벨과 동일하다.
                    } else {
                        now = levels.length;

                        if(isParagraphInPrevListItem()) {
                            result.tag = P;
                            result.level = now;

                        } else if(isNextLevelOfPrevListItem()) {
                            levels[now] = space;

                            result.level = now + 1;

                        } else if(isSameLevelOfPrevListItem()) {
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
                                result.tag = P;
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

                r = getListLevel(line[1], sentence.quote != 0);

                if(r.tag != CODEBLOCK) {
                    sentence.tag   = r.tag != null ? r.tag : tag;
                    sentence.level = r.level;
                    sentence.content = line[2];
                    return sentence;

                } else {
                    return false;
                }
            },

            line, isLine;


            if((line = sentence.content.match(regExpTag)) != null) {
                if((isLine = isThisReallyListElement(line)) !== false) {
                    return isLine;

                } else {
                    return matchCodeblock(sentence);
                }
            }

            return null;
        },

        matchWithULForm = function() {
            return matchWithListForm(UL, regExpUL, sentence)
            
        },

        matchWithOLForm = function() {
            return matchWithListForm(OL, regExpOL, sentence)
        },

        matchContinuedList = function(string, now, last) {
            var result = new RICALE.HMD.TranslateSentence(),
                above = aboveExceptBlank(now),
                prev = previousLine(now),
                line = string.match(regExpContinuedList),
                indent;

            // 1. 빈 줄을 포함한 바로 윗 줄이 존재하는 가운데,
            // 2. 그 윗줄의 목록 요소 레벨이 0이 아니라면
            // (=> 목록 요소가 계속 이어지고 있다면)
            // 이 줄은 목록 요소 내부의 문단 요소이다.
            if(prev != null && prev.level != 0) {

                // a
                if(line != null && prev.tag == CODEBLOCK && getIndentLevel(line[1]) == 8) {
                    if((prev.level - 1) * 4 <= getIndentLevel(line[2])) {
                        result.tag = CODEBLOCK;
                        result.content = line[2].slice((prev.level - 1) * 4) + line[3];
                        result.level = prev.level;
                        result.quote = last.quote;

                        return result;
                    }
                }

                result = matchBlockquotes(string);
                result.tag = P;
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
                    result = matchBlockquotes(string);
                    if(result.quote == above.quote) {
                        line = result.content.match(regExpContinuedList);

                        if(line == null) {
                            return null;
                        }
                    } else {
                        return null;
                    }
                }

                // a
                if(getIndentLevel(line[1]) == 8) {
                    if((above.level - 1) * 4 <= getIndentLevel(line[2])) {
                        result.tag = CODEBLOCK;
                        result.content = line[2].slice((above.level - 1) * 4) + line[3];
                        result.level = above.level;
                        result.quote = last.quote;

                        return result;
                    }
                }

                // b 혹은 c
                result = matching(line[3]);
                indent = getIndentLevel(line[1] + line[2]);
                indent = indent / 4 - indent / 4 % 1 + (indent % 4 != 0);

                result.level += indent > above.level ? above.level : indent;
                result.quote = above.quote;

                return result;
            }

            // 위의 어떠한 사항에도 해당하지 않는다면 이 줄은 목록 요소 내부의 블록 요소가 아니다.
            return null;
        },

        // CODEBLOCK의 정규 표현식과 일치한 결과(line)를
        // 사용하기 적절한 결과 값으로 변환해 반환한다.
        getCodeblockResult = function(line) {
            sentence.tag     = CODEBLOCK;
            sentence.content = line[2];
            return sentence;
        },

        matchHeading = function() {
            var line, headingLevel;

            if((line = sentence.content.match(regExpHeading)) != null) {
                headingLevel = line[1].length;

                switch(headingLevel) {
                    case 1: sentence.tag = H1; break;
                    case 2: sentence.tag = H2; break;
                    case 3: sentence.tag = H3; break;
                    case 4: sentence.tag = H4; break;
                    case 5: sentence.tag = H5; break;
                    case 6: sentence.tag = H6; break;
                }

                sentence.content = line[2];
                return sentence;
            }

            return null;
        },

        matchReference = function() {
            var line;

            if((line = sentence.content.match(regExpReferencedId[0])) == null) {
                line = sentence.content.match(regExpReferencedId[1]);

                return line;
            }

            return line;
        },

        matchCodeblock = function() {
            if((line = sentence.content.match(regExpCodeblock)) != null) {
                sentence.tag     = CODEBLOCK;
                sentence.content = line[2];
                return sentence;
            }

            return null;
        },

        setBlankSentence = function() {
            sentence.tag     = BLANK;
            sentence.content = "";
            return sentence;
        },

        setPrevLineAsH1 = function() {
            this.sentence[now - 1].tag = H1;
            return null;
        },

        setPrevLineAsH2 = function() {
            this.sentence[now - 1].tag = H2;
            return null;
        },

        setHRSentence = function() {
            sentence.tag     = HR;
            sentence.content = "";
            return sentence;
        },

        setReference = function() {
            this.refId[result[1]] = new RICALE.HMD.ReferencedId(result[2], result[3]);
            return null;
        },

        setParagraph = function() {
            sentence.tag = P;
            return sentence;
        };



        if(isBlank()) {
            return setBlankSentence();
        }

        if(isUnderlineForH1()) {
            return setPrevLineAsH1(); // return null
        }

        if(isUnderlineForH2()) {
            return setPrevLineAsH2(); // return null
        }

        if(isHR()) {
            return setHRSentence();
        }

        if((result = matchWithULForm()) != null) {
            return result;
        }

        if((result = matchWithOLForm()) != null) {
            return result;
        }

        if((result = matchContinuedList(string, now, sentence)) != null) {
            return result;
        }

        if((result = matchHeading()) != null) {
            return result;
        }

        if((result = matchReference()) != null) {
            return setReference(); // return null
        }

        if((result = matchCodeblock()) != null) {
            return result;
        }

        return setParagraph();

    }, // end function match

    // 이 줄(string)이 인용 요소에 포함된 줄인지,
    // 포함되어 있다면 인용 요소가 몇 번이나 중첩되어 있는지 확인한다.
    // 인용 블록 요소 확인 결과가 담긴 RICALE.HMD.TranslateSentence 객체를 반환한다.
    matchBlockquotes = function(string) {
        var result = new RICALE.HMD.TranslateSentence(),
            line = null;

        result.content = string;

        while(true) {
            line = result.content.match(regExpBlockquote);
            if(line == null) {
                return result;
            }

            result.quote += line[1].length;
            result.content = line[2];
        }
    },

    // 들여쓰기(blank)가 몇 개의 공백(space)인지 확인해 결과를 반환한다.
    // 탭(tab) 문자는 4개의 공백으로 계산한다.
    getIndentLevel = function(blank) {
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

    // 빈 줄을 제외한 바로 윗줄을 얻는다.
    // 존재하지 않으면 null을 반환한다.
    aboveExceptBlank = function(index) {
        for(var i = index - 1; i >= 0; i--) {
            if(this.result[i].tag != BLANK) {
                return this.result[i];
            }
        }

        return null;
    },

    // 빈 줄을 제외한 바로 아랫줄을 얻는다.
    // 존재하지 않으면 null을 반환한다.
    belowExceptBlank = function(index) {
        for(var i = index + 1; i < this.result.length; i++) {
            if(this.result[i].tag != BLANK) {
                return this.result[i];
            }
        }

        return null;
    },

    // 빈 줄을 포함한 바로 윗줄을 얻는다.
    // 존재하지 않으면 null을 반환한다.
    previousLine = function(index) {
        return index > 1 ? this.result[index - 1] : null;
    },

    // 빈 줄을 포함한 바로 아랫줄을 얻는다.
    // 존재하지 않으면 null을 반환한다.
    nextLine = function(index) {
        return index < this.result.length - 1 ? this.result[index + 1] : null;
    },

    // 현재 이어지고 있는 목록 요소가 끝나고 난 뒤의 줄 번호를 얻는다.
    idxBelowThisList = function(index) {
        for(var i = index + 1; i < this.result.length; i++) {
            if(this.result[i].level == 0) {
                return i + 1 < this.result.length ? i : null;
            } else if(this.result[i].tag == UL || this.result[i].tag == OL) {
                return i != index + 1 ? i : null;
            }
        }

        return null;
    },

    // 현재 이어지고 있는 목록 요소가 시작하기 전의 줄 번호를 얻는다.
    idxAboveThisList = function(index) {
        for(var i = index - 1; i >= 0; i--) {
            if(this.result[i].level == 0) {
                return i - 1 >= 0 ? i : null ;
            } else if(this.result[i].tag == UL || this.result[i].tag == OL) {
                return i != index - 1 ? i : null;
            }
        }

        return null;
    },

    // 블록 요소에 대한 해석이 끝난 줄의 본문(string)의 인라인 문법들을 찾아 바로 번역한다.
    // 아무런 인라인 문법도 포함하고 있지 않다면 인자를 그대로 반환한다.
    // 추가적으로 사용자가 번역 함수를 추가했다면 해당 함수 또한 실행된다.
    decodeInline = function(string) {
        var i, line, id;

        while((line = string.match(regExpEscape)) != null) {
            string = string.replace(line[0], this.replacerForEscapeCharacter[line[1]]);
        }

        // 문자열 내에 strong 요소가 있는지 확인하고 번역
        string = string.replace(regExpStrong[0], '<strong>$1</strong>');
        string = string.replace(regExpStrong[1], '<strong>$1</strong>');

        // 문자열 내에 em 요소가 있는지 확인하고 번역
        string = string.replace(regExpEM[0], '<em>$1</em>');
        string = string.replace(regExpEM[1], '<em>$1</em>');

        // 문자열 내에 code 요소가 있는지 확인하고 번역
        string = string.replace(regExpCode[0], '<code>$1</code>');
        string = string.replace(regExpCode[1], '<code>$1</code>');

        // 문자열 내에 참조 스타일의 img 요소가 있는지 확인하고 번역
        // 단 전체 내용 내에 대응대는 참조 정보가 없다면 번역되지 않는다.
        while((line = regExpImg.exec(string)) != null) {
            id = line[2] == "" ? line[1] : line[2];
            if(this.refId[id] != undefined){
                string = string.replace(line[0], '<img src="'+this.refId[id]['url']+'" alt="'+line[1]+'" title="'+this.refId[id]['title']+'">');
             }
         }

        // 문자열 내에 참조 스타일의 a 요소가 있는지 확인하고 번역
        // 단 전체 내용 내에 대응대는 참조 정보가 없다면 번역되지 않는다.
        while((line = regExpLink.exec(string)) != null) {
            id = line[2] == "" ? line[1] : line[2];

            if(this.refId[id] != undefined) {
                string = string.replace(line[0], '<a href="'+this.refId[id]['url']+'" title="'+this.refId[id]['title']+'">'+line[1]+'</a>');
            }

         }

        // 인라인 스타일의 img 요소가 있는지 확인하고 번역
        string = string.replace(regExpImgInline, '<img src="$2" alt="$1" title="$3">');

        // 인라인 스타일의 a 요소가 있는지 확인하고 번역
        string = string.replace(regExpLinkInline, '<a href="$2" title="$3">$1</a>');

        // url 스타일의 a 요소가 있는지 확인하고 번역
        string = string.replace(regExpLinkAuto, '<a href="$1">$1</a>');

        // br 요소가 있는지 확인하고 번역
        string = string.replace(regExpBreak, '<br/>');

        // 사용자가 추가적인 인라인 문법 번역 함수를 추가했다면 실행한다.
        if(additionalDecodeInline != null) {
            string = additionalDecodeInline(string);
        }

        string = string.replace(/<(?=[^>]*$)/g, '&lt;');

        while((line = string.match(regExpReturnEscape)) != null) {
            string = string.replace(line[0], this.replacerForEscapeCharacter[line[1]]);
        }

        return string;
    },

    // 해석한 줄들을 전체적으로 확인해 번역한다.
    // this.translate에서 바로 하지 않는 이유는
    // 전후 줄의 상태에 따라 번역이 달라질 수 있기 때문이다.
    decode = function() {
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
            prev = previousLine(i);
            next = nextLine(i);
            above = aboveExceptBlank(i);
            below = belowExceptBlank(i);

            if(r.tag != P && startP) {
                line += "</p>";
                startP = false;
            }

            if(r.tag != CODEBLOCK && startCodeblock) {
                line += "</code></pre>";
                startCodeblock = false;
            }

            // blockquote, ul/ol/li 시작/종료 여부를 판단.
            if(r.tag != BLANK) {

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
                        if(r.tag == UL || r.tag == OL) {
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
                if(r.quote < nowQuotes && prev != null && prev.tag == BLANK) {
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
                        if(r.tag == UL || r.tag == OL) {
                            if(r.level == listNested.length && r.tag != listNested[listNested.length - 1]) {
                                line += "<" + r.tag + ">";
                                listNested[listNested.length - 1] = r.tag;
                            }
                            line += "<li>";
                            startLI = true;
                        }
                    }

                    if(startLI && !startP && r.tag != CODEBLOCK) {
                        if(next && below && next.tag == BLANK && below.level == r.level) {
                            line += "<p>";
                            startP = true;
                        
                        } else if(prev && above && prev.tag == BLANK && above.level == r.level) {
                            line += "<p>";
                            startP = true;
                            
                        } else {
                            idxAbove = idxAboveThisList(i);
                            aboveIdxAbove = aboveExceptBlank(idxAbove);
                            idxBelow = idxBelowThisList(i);
                            belowIdxBelow = belowExceptBlank(idxBelow);

                            if(idxAbove && aboveIdxAbove && this.result[idxAbove].tag == BLANK && aboveIdxAbove.level == r.level) {
                                line += "<p>";
                                startP = true;

                            } else if(idxBelow && belowIdxBelow && this.result[idxBelow].tag == BLANK && belowIdxBelow.level == r.level) {
                                line += "<p>";
                                startP = true;

                            } else {
                                for(j = i + 1; j < idxBelow; j++) {
                                    if(this.result[j].tag == P) {
                                        this.result[j].tag = undefined;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if(r.tag == CODEBLOCK) {
                r.content = r.content.replace(/[<>&]/g, function(whole) {
                    switch(whole) {
                        case '<': return '&lt;';
                        case '>': return '&gt;';
                        case '&': return '&amp;';
                    }
                });
            } else {
                r.content = decodeInline(r.content);
            }

            switch(r.tag) {
                // 제목(h1, h2, h3, h4, h5, h6) 혹은 수평선(hr)일 때의 번역.
                // 내용이 짧은 관계로 붙여서 작성햇다.
                case H1:    line += "<h1>" + r.content + "</h1>"; break;
                case H2:    line += "<h2>" + r.content + "</h2>"; break;
                case H3:    line += "<h3>" + r.content + "</h3>"; break;
                case H4:    line += "<h4>" + r.content + "</h4>"; break;
                case H5:    line += "<h5>" + r.content + "</h5>"; break;
                case H6:    line += "<h6>" + r.content + "</h6>"; break;
                case HR:    line += "<hr/>"; break;
                case BLANK: line += "\n"; break;
                case P:
                    if(!startP) {
                        line += "<p>";
                        startP = true;
                    }
                    line += r.content;
                break;

                case CODEBLOCK:
                    if(!startCodeblock) {
                        line += "<pre><code>";
                        startCodeblock = true;
                    }
                    line += r.content + "\n";
                break;

                default: line += r.content; break;
            }

            string += line;
        }



        $(targetSelector).html(string);
    }

    return {

        constructor: RICALE.HMD.Decoder,
        
        // ### public method
        // - sourceTextareaSelector : 마크다운 형식의 문자열이 있는 HTML의 contentarea 요소의 셀렉터
        // - targetElementSelector : HTML 형식의 번역 결과가 출력될 HTML 요소의 셀렉터
        run: function(sourceTextareaSelector, targetElementSelector) {
            var self = this, interval = null;

            targetSelector = targetElementSelector;

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
                translate($(sourceTextareaSelector).val());
            });

            $(sourceTextareaSelector).trigger('keyup');
        },

        // 추가적인 인라인 요소 번역 함수를 설정한다.
        // 이는 기존의 인라인 요소 문법에 대한 확인이 모두 끝난 다음에 실행된다.
        setAdditionalDecodeInlineFunction: function(func) {
            additionalDecodeInline = func;
        }
    }
})(); // RICALE.HMD.Decoder.prototype

RICALE.hmd = new RICALE.HMD.Decoder();