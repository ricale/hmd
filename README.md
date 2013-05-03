# handmade markdown decoder

1. 기본 정보
2. 개요
3. 사용 방법
4. hmd 마크다운 문법
5. 추가 요소
6. 문서 정보

## 1. 기본 정보

* 프로젝트 이름 : handmade markdown decoder (hmd)
* 구현 언어 : JavaScript (jQuery)
* 작성자 : ricale
* 버전 : 0.2

## 2. 개요

handmade markdown decoder (hmd)는 마크다운 문법을 HTML 형식으로 출력해주는 자바스크립트 컴포넌트이다.

마크다운 문법은 기본적으로 [이 곳][syntax]의 문법을 따른다. 단 근본적인 문법을 변경하지 않는 선에서 세부사항이 변경될 수 있다. 현재 hmd에서의 마크다운 문법의 상세는 이 문서에서 확인할 수 있다.

[syntax]: http://daringfireball.net/projects/markdown/syntax

## 3. 사용 방법

아래의 코드로 실행한다.

    RICALE.hmd.run(sourceTextareaSelector, targetElementSelector);
	
+ sourceTextareaSelector는 마크다운 문법의 글이 작성되어있는 textarea의 셀렉터이다. 
+ targetElementSelector는 HTML로 번역된 결과가 출력될 HTML 요소의 셀렉터이다.
+ 이 메서드를 실행하는 순간 번역이 실행되고 이 후에는 textarea에서 키보드 입력이 있을때마다 번역된다.

추가적으로, 아래의 코드로 인라인 문법을 추가할 수 있다. (이는 필수적인 요소가 아니다.)

    RICALE.hmd.setAdditionalDecodeInlineFunction(func);
    
+ 추가하고 싶은 문법을 번역하는 함수를 작성해 인자로 위 함수의 인자로 넘겨준다.
+ 아래의 형식으로 작성되어야 한다.

        function func(string) {
            ......
            return result;
        }
        
+ 인자는 번역할 문자열이다.
+ 반환값은 번역된 문자열이다. 여기서 번역이라 함은 추가한 문법에 대해 일치하는 구문을 _HTML 형식으로 변환한_ 문자열을 말한다.

## 4. hmd 마크다운 문법

1. 블록 요소 Block Element
    1. 문단 p
    2. 제목 h1 h2 h3 h4 h5 h6
    3. 인용 blockquote
    4. 목록
        1. 비순서적 목록 ul
        2. 순서적 목록 ol
        3. 목록 공통
    5. 코드 블록 pre & code
    6. 수평선 hr
2. 인라인 요소 Inline Element
    1. 링크 a
        1. 인라인 스타일
        2. 레퍼런스 스타일
        3. 자동 링크
    2. 강조 em, strong
    3. 코드 code
    4. 이미지 img
    5. 줄바꿈 br
    6. 탈출 문자 \\

### 블록 요소

#### 문단

문단은 하나 이상의 빈 문장으로 나뉜다. 빈 문장은 아무것도 포함하지 않거나 공백(space, tab)만을 포함한 문장이다.

줄을 아무리 띄어도 문단p으로 적용될 뿐 줄바꿈br이 적용되지 않는다. 줄바꿈을 적용하길 원한다면 줄의 마지막에 공백을 두 개 이상 넣으면 된다.

#### 제목

\#를 사용한다.

>     # h1스타일의제목
>     ## h2스타일의제목
>     ### h3스타일의제목
>     #### h4스타일의제목
>     ##### h5스타일의제목
>     ###### h6스타일의제목

\# 스타일의 경우 닫는 것도 가능하다. 닫을 때 #의 개수는 몇 개든 상관없다.

>     # 닫기 #
>     ## 또 닫기 ##
>     ### 다시 닫기 #####

문법상 ===== 스타일과 ----- 스타일도 존재하지만

>     h1스타일의제목  
>     =========== (=의 개수는 몇 개든 상관없다)
>     h2스타일의제목  
>     ----------- (-의 개수는 몇 개든 상관없다)

#### 인용

\>를 사용한다.

>     > blockquote스타일
>
>     > 인용 내에서의 문단 나눔도 빈 줄로 한다.
>     > 다른 블록 요소 중첩도 가능하다.

#### 목록

##### 비순서적 목록

\* 또는

>     * 목록하나
>     * 둘
>     * 셋

\- 또는

>     - 하나
>     - 둘
>     - 셋

\+ 를 사용한다.

>     + 하나
>     + 둘
>     + 셋

##### 순서적 목록

숫자를 사용한다.

>     1. 순서 목록
>     2. 둘
>     3. 셋

숫자의 순서는 틀려도 상관없다.

>     3. 순서
>     2. 목록
>     100. 이다

##### 목록 공통

목록 내에서 줄을 바꿔도 줄바꿈이 적용되지 않는다.

>     1. 순서
>     목록
>     이다

###### 결과

> 1. 순서
>  목록
>  이다.

줄바꿈을 유도하려면 줄 끝에 공백 두 개를 넣거나 빈 줄을 넣어 문단을 나눠야 한다.

>     1. 순서
>
>      목록
>
>      이다

###### 결과

> 1. 순서
> 
>  목록
>
>  이다
 
들여쓰기에 주의하라. 한 칸 이상의 들여쓰기가 없다면 해당 줄을 목록의 연장으로 판단하지 않고 새로운 문단으로 판단한다.

목록에 코드 블록을 넣고 싶다면 빈 줄 이후 기존 코드 블록의 두 배(8개)의 공백을 주면 된다. 

>     1. 테스트
>
>             코드블록테스트

###### 결과

> 1. 테스트
>
>         코드블록 테스트

단, 이는 목록이 중첩되지 않았을 경우이고 목록이 여러번 중첩되었을 경우에는 _8 + (목록 중첩 횟수 - 1) * 4_ 개의 공백을 주면 된다.

목록 요소의 각 레벨의 들여쓰기는 아래와 같다. 기준에 맞지 않을 시에는 목록 요소로서 표현되지 않거나, 의도와 다르게 표시될 수 있다. 들여쓰기 단위는 공백(space)이며, 탭(tab)은 네 개의 공백으로 계산된다.

* 레벨 1 - 0개 ~ 3개
* 레벨 2 - (레벨 1의 공백 + 1)개 ~ 7개
- 레벨 3 - (레벨 2의 공백 + 1)개 ~ 11개
* 레벨 n - (레벨 n-1의 공백 + 1)개 ~ (n * 4 - 1)개

#### 코드 블록

공백 네 개로 들여쓰기 한다.

>         테스트
>         코드블록테스트

###### 결과

    테스트
    코드블록테스트

코드 블록 내의 모습은 마크다운 문법에 상관 없이 그대로 출력된다.

#### 수평선

\- 또는 \_ 또는 \*을 한 줄에 셋 이상 입력한다.

>     ---
>     ___
>     ***

###### 결과

> ---
> ___
> ***

문자들 사이에 공백이 포함되어 있어도 가능하다.

>     -   -    -
>       _     _ _
>      *  *  *

###### 결과

> -   -    -
>   _     _ _
>  *  *  *

### 인라인 요소

#### 링크

##### 인라인 스타일

아래의 스타일을 사용한다. 제목은 생략할 수 있다.

>     [텍스트](http://google.com "제목")
>     [텍스트](http://google.com)

##### 레퍼런스 스타일

링크 텍스트와 url 부분을 나누어 쓴다. 주소는 <>로 감싸도 된다. 제목은 "" 혹은 '' 혹은 ()로 감싸거나 생략할 수 있다.

>     [텍스트][id]
>     [id]: http://google.com "제목"
>     [id]: http://google.com '제목'
>     [id]: http://google.com (제목)
>     [id]: <http://google.com> "제목"
>     [id]: <http://google.com> '제목'
>     [id]: <http://google.com> (제목)
>     [id]: http://google.com
>     [id]: <http://google.com>

텍스트와 아이디 사이에 공백이 허용된다.

>     [텍스트] [id]

아이디를 생략할 수도 있는데 아이디를 생략하면 텍스트가 아이디 역할까지 맡는다.

>     [텍스트][]
>     [텍스트]: http://google.com

텍스트와 아이디에는 '['와 ']'를 사용할 수 없다.

##### 자동 링크

url을 <>로 감싸면 자동으로 링크가 적용된다.

>     <http://google.com>

_단 <> 안의 문자열이 http:// 혹은 https:// 으로 시작해야지만 적용된다._ 이는 본래 문법에 있는 것인지는 확인되지 않고, hmd에서는 적용된 사항이다.

이메일 링크는 자동 암호화한다는 데 뭔지 모르겠다. hmd에는 구현되어있지 않다.

#### 강조

글을 * 혹은 _로 감싸면 em 효과가 적용된다.

>     _내용_
>     *내용*

글을 ** 혹은 __로 감싸면 strong 효과가 적용된다.

>     __내용__
>     **내용**

둘을 섞어 쓰면 안되지만 일부 에디터에서는 아래처럼 섞어 쓰기도 한다. hmd는 섞어 쓰는 것을 지원하지 않는다.

>     _*내용**
>     _*내용_*
>     __내용_*
>     *내용_

#### 코드

\`로 감싸면 코드 태그가 적용된다.

>     `코드`

코드 내부에서 \`문자를 사용할 때를 위해 \`\`로 감쌀 수도 있다.

>     ``코드``

코드의 첫/마지막 글자에 \`를 사용하고 싶다면 한 칸 공백을 준다.

>     `` `코드` ``

#### 이미지

맨 앞에 !가 붙는 것과 []안의 텍스트가 alt 역할을 한다는 것만 빼면 링크와 동일하다. 상세 내용은 생략한다. 링크를 참고 바란다.

#### 줄바꿈

줄의 마지막에 공백을 연속으로 두 개 이상 입력하면 된다.

>     줄바꿈
>     테스트1
>
>     줄바꿈  
>     테스트2

###### 결과

> 줄바꿈
테스트1

> 줄바꿈  
테스트2

#### 탈출 문자

마크다운 문법에 쓰이는 문자들 ('\-', '\_', '\+', '\#', '\>', '\.', '\*', '\\')을 마크다운 문법이 적용될 위치에서 마크다운 문법을 적용시키지 않게 사용하고 싶다면 앞에 백슬러시(\\)를 붙이면 된다.

>     \# 백슬래시 테스트

###### 결과

> \# 백슬래시 테스트

## 5. 추가 요소

+ hmd.ricaleinline.js

### hmd.ricaleinline

1. 개요
2. 문법
 1. 삭선 del
 2. 위 첨자 sup
 3. 아래 첨자 sub

#### 개요

+ 인라인 문법 추가 기능의 테스트를 위해 작성하였다.
+ 기존의 마크다운에서 지원하지 않는 del, sup, sub 태그에 매칭되는 문법을 추가하였다.

#### 문법

##### 삭선

--로 감싸면 del이 적용된다.

>     --내용--

##### 위 첨자

\^\^로 감싸면 sup가 적용된다.

>     ^^내용^^

##### 아래 첨자

,,로 감싸면 sub가 적용된다.

>     ,,내용,,

## 6. 문서 정보

- 작성자 : ricale
- 문서버전 : 0.3 (hmd 0.2)
- 작성일 : 2013. 5. 2.