/**
 * Created by yj on 2016/12/22.
 */
//第一步
function Lexer(){
    this.text = text;
    this.index = 0;
    this.ch = undefined;
    this.tokens = [];
    while (this.index < this.text.length) {
        this.ch = this.text.charAt(this.index);
        if (this.isNumber(this.ch)) {
            this.readNumber();
        } else {
            throw 'Unexpected next character: ' + this.ch;
        }
    }
    return this.tokens;
}
Lexer.prototype.lex = function (lex) {

};
Lexer.prototype.isNumber = function(ch) {
    return '0' <= ch && ch <= '9';
};
Lexer.prototype.readNumber = function() {
    var number = '';
    while (this.index < this.text.length) {
        var ch = this.text.charAt(this.index);
        if (this.isNumber(ch)) {
            number += ch;
        } else {
            break;
        }
        this.index++;
    }
    this.tokens.push({
        text: number,
        value: Number(number)
    });
};
//第二步
function AST(lexer) {
    this.lexer = lexer;
}
//这些常量将用于抽象结构树中每个节点的type属性，该属性描述了这个节点的语法特征
//每棵抽象结构树的顶级都是AST.Program类型的
AST.Program = 'Program';
AST.Literal = 'Literal';
AST.prototype.ast = function(text) {
    this.tokens = this.lexer.lex(text);
    return this.program();
};
AST.prototype.program = function() {
    return {
        type: AST.Program,
        body: this.constant()
    };
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
ASTCompiler.prototype.compile = function(text) {
    var ast = this.astBuilder.ast(text);
    this.state = {body: []};
    this.recurse(ast);
};
ASTCompiler.prototype.recurse = function(ast) {
};
//第四步
function Parser(lexer) {
    this.lexer = lexer;
    this.ast = new AST(this.lexer);
    this.astCompiler = new ASTCompiler(this.ast);
}
Parser.prototype.parse = function(text) {
    return this.astCompiler.compile(text);
};
//===================编译过程
function parse(expr) {
    var lexer = new Lexer();
    var parser = new Parser(lexer);
    return parser.parse(expr);
}