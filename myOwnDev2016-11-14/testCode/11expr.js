/**
 * Created by yj on 2016/12/22.
 */
//expression部分用了一些标准中不建议使用的js特性，例如eval和with
//核心思想：一个parse函数 该函数接收一个表达式，返回一个函数，这个函数通过with使其作用域变为一个scope
// function parse(expr) {
//     return function(scope) {
//         with (scope) {
//             return eval(expr);
//         }
//     }
// }
//解析该表达式不能用eval，因为这里面还有管道符（用来实现过滤器）
//第一步
function Lexer(){

}
Lexer.prototype.lex = function (lex) {

};
//第二步
function AST(lexer) {
    this.lexer = lexer;
}
AST.prototype.ast = function(text) {
    this.tokens = this.lexer.lex(text);
};
//第三步
function ASTCompiler(astBuilder) {
    this.astBuilder = astBuilder;
}
ASTCompiler.prototype.compile = function(text) {
    var ast = this.astBuilder.ast(text);
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