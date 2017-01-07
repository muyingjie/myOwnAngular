/**
 * Created by yj on 2016/12/30.
 */
// parse("aKey") 将返回当前所处上下文的aKey属性的值，如下所示
// function ($scope){
//     return $scope.aKey;
// }
var ESCAPES = {
    'n':'\n',
    'f':'\f',
    'r':'\r',
    't':'\t',
    'v':'\v',
    '\'':'\'',
    '"':'"'
};
function Lexer(){

}
Lexer.prototype.lex = function (text) {
    this.text = text;
    this.index = 0;
    this.ch = undefined;
    this.tokens = [];
    while (this.index < this.text.length) {
        this.ch = this.text.charAt(this.index);
        //当前字符为'.'而且下一个字符是数字类型时，按照处理数字的算法处理
        if (this.isNumber(this.ch) || (this.is(".") && this.isNumber(this.peek()))) {
            this.readNumber();
        } else if(this.is("\'\"")) {
            this.readString(this.ch);
        } else if(this.ch.is("[],{}:.")) {
            //此处并没有解析数组内部的具体内容，具体内容的解析在arrayDeclaration成员方法中
            this.tokens.push({
                text: this.ch
            });
            this.index++;
        } else if(this.isIdent(this.ch)) {
            this.readIdent();
        } else if(this.isWhitespace(this.ch)) {
            this.index++;
        } else {
            throw 'Unexpected next character: ' + this.ch;
        }
    }
    return this.tokens;
};
Lexer.prototype.is = function(chs) {
    return chs.indexOf(this.ch) >= 0;
};
Lexer.prototype.isNumber = function(ch) {
    return '0' <= ch && ch <= '9';
};
Lexer.prototype.readNumber = function() {
    var number = '';
    while (this.index < this.text.length) {
        var ch = this.text.charAt(this.index).toLowerCase();
        if (ch === '.' || this.isNumber(ch)) {
            number += ch;
        } else {
            var nextCh = this.peek();
            var prevCh = number.charAt(number.length - 1);
            if (ch === 'e' && this.isExpOperator(nextCh)) {
                number += ch;
            } else if (this.isExpOperator(ch) && prevCh === 'e' &&
                nextCh && this.isNumber(nextCh)) {
                number += ch;
            } else if (this.isExpOperator(ch) && prevCh === 'e' &&
                (!nextCh || !this.isNumber(nextCh))) {
                throw "Invalid exponent";
            } else {
                break;
            }
        }
        this.index++;
    }
    this.tokens.push({
        text: number,
        value: Number(number)
    });
};
//传进来的参数quote代表字符串的开始符号是什么（单引号或双引号）
Lexer.prototype.readString = function(quote) {
    this.index++;
    var string = '';
    var escape = false;
    while (this.index < this.text.length) {
        var ch = this.text.charAt(this.index);
        if(escape){
            if (ch === 'u') {
                //处理以\u开头（如\u4e00）类型的转义字符
                var hex = this.text.substring(this.index + 1, this.index + 5);
                if (!hex.match(/[\da-f]{4}/i)) {
                    throw 'Invalid unicode escape';
                }
                this.index += 4;
                string += String.fromCharCode(parseInt(hex, 16));
            } else {
                //处理普通转义字符
                var replacement = ESCAPES[ch];
                if (replacement) {
                    string += replacement;
                } else {
                    string += ch;
                }
            }
            escape = false;
        } else if (ch === quote) {
            this.index++;
            this.tokens.push({
                text: string,
                value: string
            });
            return;
        } else if(ch === '\\') {
            escape = true;
        } else {
            string += ch;
        }
        this.index++;
    }
    throw 'Unmatched quote';
};
//识别标识符 token
Lexer.prototype.isIdent = function(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
        ch === '_' || ch === '$';
};
//读取标识符
Lexer.prototype.readIdent = function() {
    var text = '';
    while (this.index < this.text.length) {
        var ch = this.text.charAt(this.index);
        if (this.isIdent(ch) || this.isNumber(ch)) {
            text += ch;
        } else {
            break;
        }
        this.index++;
    }
    var token = {
        text: text,
        identifier: true
    };
    this.tokens.push(token);
};
//获取当前位置后面的字符，如果到达了表达式末尾，则返回false
Lexer.prototype.peek = function() {
    return this.index < this.text.length - 1 ?
        this.text.charAt(this.index + 1) :
        false;
};
//紧跟在指数标识e后面的字符
Lexer.prototype.isExpOperator = function(ch) {
    return ch === '-' || ch === '+' || this.isNumber(ch);
};
//判断空白符
Lexer.prototype.isWhitespace = function(ch) {
    return ch === ' ' || ch === '\r' || ch === '\t' ||
        ch === '\n' || ch === '\v' || ch === '\u00A0';
};
//第二步
function AST(lexer) {
    this.lexer = lexer;
}
//这些常量将用于抽象结构树中每个节点的type属性，该属性描述了这个节点的语法特征
//每棵抽象结构树的顶级都是AST.Program类型的
AST.Program = 'Program';
AST.Literal = 'Literal';
AST.ArrayExpression = 'ArrayExpression';
AST.ObjectExpression = 'ObjectExpression';
AST.Property = 'Property';
AST.Identifier = 'Identifier';
AST.ThisExpression = 'ThisExpression';
AST.MemberExpression = 'MemberExpression';
AST.prototype.constants = {
    'null': {type: AST.Literal, value: null},
    'true': {type: AST.Literal, value: true},
    'false': {type: AST.Literal, value: false},
    'this': {type: AST.ThisExpression}
};
AST.prototype.ast = function(text) {
    this.tokens = this.lexer.lex(text);
    return this.program();
};
AST.prototype.program = function() {
    return {
        type: AST.Program,
        // body: this.constant()
        body: this.primary()
    };
};
AST.prototype.primary = function() {
    var primary;
    //================================数组也是常量，因此需要放在primary函数中去==================================
    if (this.expect('[')){
        primary = this.arrayDeclaration();
    }
    //================================对象也是常量，因此需要放在primary函数中去==================================
    else if(this.expect('{')){
        primary = this.object();
    }
    //=====================================以下为对一个token的常量的处理=======================================
    else if (this.constants.hasOwnProperty(this.tokens[0].text)) {
        //先看是否为true false null
        // return this.constants[this.tokens[0].text]; 不能确保每个tokens的长度一定大于1
        primary = this.constants[this.consume().text];
    }
    //================================对标识符的处理==========================================================
    else if (this.peek().identifier) {
        primary = this.identifier();
    }
    else {
        primary = this.constant();
    }
    //在解析完一个token之后如果又遇到了点"." 则代表对象引用
    // 刚刚解析完的token就变成了对象，接下来解析的是跟在该对象后的属性
    // 因为对象可以访问任意级，因此需要循环每个属性
    while (this.expect('.')) {
        primary = {
            type: AST.MemberExpression,
            property: this.identifier(),
            object: primary
        };
    }
    return primary;
};
AST.prototype.constant = function() {
    return {
        type: AST.Literal,
        // value: this.tokens[0].value
        value: this.consume().value
    };
};
AST.prototype.identifier = function() {
    return {
        type: AST.Identifier,
        name: this.consume().text
    };
};
//该函数具体解析数组里面的每一项
AST.prototype.arrayDeclaration = function() {
    var elements = [];
    if (!this.peek(']')) {
        do {
            //遇到数组最后多了一个逗号的情况，直接结束循环
            if(this.peek(']')){
                break;
            }
            //会一直递归调用，直到找到基础类型的token（常量或变量）
            elements.push(this.primary());
        } while (this.expect(','));
    }
    this.consume(']');
    //将elements整合到AST树节点的elements属性中，elements是数组类型节点才有的属性
    return {type: AST.ArrayExpression, elements: elements};
};
//对象在AST节点中的结构和数组类似
AST.prototype.object = function() {
    //收集所有属性节点的容器
    var properties = [];
    if(!this.peek('}')){
        do {
            //对象中的每个属性都是一个节点
            var property = {
                type: AST.Property
            };
            //属性的key又可以看成一个节点
            if(this.peek().identifier){
                //兼容key没有带引号的情况，即{aaa: 1}
                property.key = this.identifier();
            }else{
                //兼容key带引号的情况，即{"aaa": 1}这里的constant实际上用于处理字符串的情况
                property.key = this.constant();
            }
            //key所处token被编译完后，接下来的token应该是':'
            this.consume(':');
            property.value = this.primary();
            properties.push(property);
        } while (this.expect(','));
    }
    this.consume('}');
    return {
        type: AST.ObjectExpression,
        properties: properties
    };
};
//下一个token是否为参数e
//如果token是参数e或者不传参时，将该token从tokens栈中弹出
AST.prototype.expect = function(e) {
    var token = this.peek(e);
    if(token){
        return this.tokens.shift();
    }
};
//看一下下一个token是否为参数e，内部调用expect成员方法，因此如果token和参数e相等的话，将tokens栈弹出一个token
AST.prototype.consume = function(e) {
    var token = this.expect(e);
    //当数组结束时如果没有结束符，token将返回false，直接抛出异常
    if (!token) {
        throw 'Unexpected. Expecting: ' + e;
    }
    return token;
};
//从栈顶取出一个token，并和参数e（即期望值）比较，如果二者相等，则返回token栈顶项
//不传参时也返回栈顶项
AST.prototype.peek = function(e) {
    if (this.tokens.length > 0) {
        var text = this.tokens[0].text;
        if (text === e || !e) {
            return this.tokens[0];
        }
    }
};
//第三步
function ASTCompiler(astBuilder) {
    this.astBuilder = astBuilder;
}
//compile方法最终需要返回一个函数
ASTCompiler.prototype.compile = function(text) {
    var ast = this.astBuilder.ast(text);
    //在编译生成函数时，函数里面需要定义很多变量，这些变量名以v开头，后面依次跟上递增的数字，nextId代表该递增的数字
    //Js中变量名会提升，因此我们把定义变量的工作放在最顶层，vars存储所有定义过的变量
    this.state = {body: [], nextId: 0, vars: []};
    //recurse方法会给body数组push一段一段的字符串，这些字符串最终会拼接成一个函数体
    this.recurse(ast);
    //返回最终的函数
    //参数s即为scope对象
    // return new Function("s", this.state.body.join(""));
    //改为将所有的变量提升到函数最上方定义
    return new Function('s', 'l',
        (this.state.vars.length ?
            'var ' + this.state.vars.join(',') + ';' :
                ''
        ) + this.state.body.join(''));
};
ASTCompiler.prototype.recurse = function(ast) {
    var intoId;
    switch (ast.type){
        //Program需要生成return表达式
        case AST.Program:
            this.state.body.push("return ", this.recurse(ast.body), ";");
            break;
        //Literal是叶子节点，仅仅是一个值，因此我们直接返回它即可
        case AST.Literal:
            return this.escape(ast.value);
        case AST.ArrayExpression:
            //将抽象树中的各项转为常量字符串
            var elements = _.map(ast.elements, function (element) {
                return this.recurse(ast.elements);
            }, this);
            return "[" + elements.join(",") + "]";
        case AST.ObjectExpression:
            var properties = _.map(ast.properties, function (property) {
                var key = property.key.type === AST.Identifier ? property.key.name :
                    this.escape(property.key.value);
                var value = this.recurse(property.value);
                return key + ":" + value;
            }, this);
            return "{" + properties.join(',') + "}";
        case AST.Identifier:
            // var intoId = this.nextId();
            // intoId变量需要在多个case下共用
            intoId = this.nextId();
            // 在new Function的函数体里面已经var定义过所有的变量了，因此在此无需再重复定义
            // this.state.body.push("var ", intoId, ";");
            // 函数中如果传入第二个参数l，就用对象l
            // this.if_('l', this.assign(intoId, this.nonComputedMember('l', ast.name)));
            // 对象l中存在ast.name属性时才用l对象的属性，否则用s对象的
            this.if_(this.getHasOwnProperty('l', ast.name),
                this.assign(intoId, this.nonComputedMember('l', ast.name)));
            // this.if_(this.not("l") + " && s", this.assign(intoId , this.nonComputedMember("s", ast.name) + ";"));
            this.if_(this.not(this.getHasOwnProperty('l', ast.name)) + ' && s',
                this.assign(intoId, this.nonComputedMember('s', ast.name)));
            return intoId;
        case AST.ThisExpression:
            return "s";
        case AST.MemberExpression:
            intoId = this.nextId();
            var left = this.recurse(ast.object);
            this.if_(left,
                this.assign(intoId, this.nonComputedMember(left, ast.property.name)));
            return intoId;
    }
};
ASTCompiler.prototype.escape = function(value) {
    if (_.isString(value)) {
        return '\'' + value.replace(this.stringEscapeRegex, this.stringEscapeFn) + '\'';
    } else if(_.isNull(value)){
        return "null";
    } else {
        return value;
    }
};
ASTCompiler.prototype.stringEscapeRegex = /[^ a-zA-Z0-9]/g;
ASTCompiler.prototype.stringEscapeFn = function(c) {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
};
ASTCompiler.prototype.nonComputedMember = function(left, right) {
    return '(' + left + ').' + right;
};
ASTCompiler.prototype.if_ = function(test, consequent) {
    this.state.body.push('if(', test, '){', consequent, '}');
};
ASTCompiler.prototype.assign = function(id, value) {
    return id + '=' + value + ';';
};
ASTCompiler.prototype.nextId = function() {
    var id = 'v' + (this.state.nextId++);
    this.state.vars.push(id);
    return id;
};
ASTCompiler.prototype.not = function(e) {
    return '!(' + e + ')';
};
ASTCompiler.prototype.getHasOwnProperty = function(object, property) {
    return object + '&&(' + this.escape(property) + ' in ' + object + ')';
};
//第四步
function Parser(lexer) {
    this.lexer = lexer;
    this.ast = new AST(this.lexer);
    this.astCompiler = new ASTCompiler(this.ast);
}
//parse方法最后会返回一个函数
Parser.prototype.parse = function(text) {
    return this.astCompiler.compile(text);
};
//===================编译过程
//parse方法接收一个字符串类型的表达式，返回一个函数，这个函数的返回值将是该表达式在所处的scope环境中的值
function parse(expr) {
    var lexer = new Lexer();
    var parser = new Parser(lexer);
    return parser.parse(expr);
}