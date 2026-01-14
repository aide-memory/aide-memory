; Vendored from nvim-treesitter - highlights for comments and documentation
; Source: https://github.com/nvim-treesitter/nvim-treesitter/blob/master/queries/python/highlights.scm

; Comments
(comment) @comment

; TODO/FIXME markers
((comment) @comment.todo
  (#match? @comment.todo "(TODO|FIXME|HACK|XXX|NOTE)"))

; Docstrings (first string in function/class body)
(function_definition
  body: (block
    (expression_statement
      (string) @comment.documentation)))

(class_definition
  body: (block
    (expression_statement
      (string) @comment.documentation)))

; Module docstrings
(module
  (expression_statement
    (string) @comment.documentation) @_first
  (#eq? @_first 1))

; String literals
(string) @string

