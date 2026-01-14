; Vendored from nvim-treesitter with modifications for symbol extraction
; Source: https://github.com/nvim-treesitter/nvim-treesitter/blob/master/queries/python/tags.scm

; Functions
(function_definition
  name: (identifier) @name) @definition.function

; Async functions
(function_definition
  name: (identifier) @name) @definition.function

; Classes
(class_definition
  name: (identifier) @name) @definition.class

; Methods (functions inside classes)
(class_definition
  body: (block
    (function_definition
      name: (identifier) @name) @definition.method))

; Decorated functions
(decorated_definition
  (function_definition
    name: (identifier) @name)) @definition.function

; Decorated classes
(decorated_definition
  (class_definition
    name: (identifier) @name)) @definition.class

; Module-level variable assignments (constants/globals)
(module
  (expression_statement
    (assignment
      left: (identifier) @name))) @definition.variable

; Type aliases (Python 3.12+)
(type_alias_statement
  name: (type) @name) @definition.type

