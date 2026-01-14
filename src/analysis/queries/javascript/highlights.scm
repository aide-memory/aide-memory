; Vendored from nvim-treesitter - highlights for comments and documentation
; Source: https://github.com/nvim-treesitter/nvim-treesitter/blob/master/queries/javascript/highlights.scm

; Comments
(comment) @comment

; JSDoc comments
((comment) @comment.documentation
  (#match? @comment.documentation "^/\\*\\*"))

; TODO/FIXME markers
((comment) @comment.todo
  (#match? @comment.todo "(TODO|FIXME|HACK|XXX|NOTE)"))

; Strings
(template_string) @string
(string) @string

