; Vendored from nvim-treesitter - highlights for comments and documentation
; Source: https://github.com/nvim-treesitter/nvim-treesitter/blob/master/queries/typescript/highlights.scm

; Comments
(comment) @comment

; JSDoc comments
((comment) @comment.documentation
  (#match? @comment.documentation "^/\\*\\*"))

; TODO/FIXME markers
((comment) @comment.todo
  (#match? @comment.todo "(TODO|FIXME|HACK|XXX|NOTE)"))

; Strings (for docstrings in template literals)
(template_string) @string

; String literals
(string) @string

