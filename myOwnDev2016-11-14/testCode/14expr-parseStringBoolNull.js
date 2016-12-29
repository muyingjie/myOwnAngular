/**
 * Created by yj on 2016/12/28.
 */
// 重点：
// AST树：
// var ASTInstance = {
//     type: AST.Program,
//     body: {
//         type: AST.Literal,
//         value: null
//     }
// };
//
//
// AST树的解析
// switch (ast.type){
//     //Program需要生成return表达式
//     case AST.Program:
//         this.state.body.push("return ", this.recurse(ast.body), ";");
//         break;
//     //Literal是叶子节点，仅仅是一个值，因此我们直接返回它即可
//     case AST.Literal:
//         return this.escape(ast.value);
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
        if (this.isNumber(this.ch) || (this.ch == '.' && this.isNumber(this.peek()))) {
            this.readNumber();
        } else if(this.ch === '\'' || this.ch === '"') {
            this.readString(this.ch);
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
Lexer.prototype.isNumber = function(ch) {
    return '0' <= ch && ch <= '9';
};
//处理标识符 token
Lexer.prototype.isIdent = function(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
        ch === '_' || ch === '$';
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
    var token = {text: text};
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
AST.prototype.constants = {
    'null': {type: AST.Literal, value: null},
    'true': {type: AST.Literal, value: true},
    'false': {type: AST.Literal, value: false}
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
    //先看是否为true false null
    if (this.constants.hasOwnProperty(this.tokens[0].text)) {
        return this.constants[this.tokens[0].text];
    } else {
        return this.constant();
    }
};
AST.prototype.constant = function() {
    return {
        type: AST.Literal,
        value: this.tokens[0].value
    };
};
//第三步
function ASTCompiler(astBuilder) {
    this.astBuilder = astBuilder;
}
//compile方法最终需要返回一个函数
ASTCompiler.prototype.compile = function(text) {
    var ast = this.astBuilder.ast(text);
    this.state = {body: []};
    //recurse方法会给body数组push一段一段的字符串，这些字符串最终会拼接成一个函数体
    this.recurse(ast);
    //返回最终的函数
    return new Function(this.state.body.join(""));
};
ASTCompiler.prototype.recurse = function(ast) {
    switch (ast.type){
        //Program需要生成return表达式
        case AST.Program:
            this.state.body.push("return ", this.recurse(ast.body), ";");
            break;
        //Literal是叶子节点，仅仅是一个值，因此我们直接返回它即可
        case AST.Literal:
            return this.escape(ast.value);
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