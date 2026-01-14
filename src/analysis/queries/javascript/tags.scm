; Vendored from nvim-treesitter with modifications for symbol extraction
; Source: https://github.com/nvim-treesitter/nvim-treesitter/blob/master/queries/javascript/tags.scm

; Functions
(function_declaration
  name: (identifier) @name) @definition.function

(generator_function_declaration
  name: (identifier) @name) @definition.function

; Arrow functions assigned to variables
(lexical_declaration
  (variable_declarator
    name: (identifier) @name
    value: (arrow_function))) @definition.function

(variable_declaration
  (variable_declarator
    name: (identifier) @name
    value: (arrow_function))) @definition.function

; Classes
(class_declaration
  name: (identifier) @name) @definition.class

; Methods
(method_definition
  name: (property_identifier) @name) @definition.method

; Module exports (CommonJS)
(assignment_expression
  left: (member_expression
    object: (identifier) @_exports
    property: (property_identifier) @name)
  right: (function_expression)) @definition.function
  (#eq? @_exports "exports")

(assignment_expression
  left: (member_expression
    object: (member_expression
      object: (identifier) @_module
      property: (property_identifier) @_exports)
    property: (property_identifier) @name)
  right: (function_expression)) @definition.function
  (#eq? @_module "module")
  (#eq? @_exports "exports")

; Export statements
(export_statement
  declaration: (function_declaration
    name: (identifier) @name)) @definition.function

(export_statement
  declaration: (class_declaration
    name: (identifier) @name)) @definition.class

