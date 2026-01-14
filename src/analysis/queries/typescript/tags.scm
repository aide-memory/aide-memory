; Vendored from nvim-treesitter with modifications for symbol extraction
; Source: https://github.com/nvim-treesitter/nvim-treesitter/blob/master/queries/typescript/tags.scm

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
  name: (type_identifier) @name) @definition.class

; Methods
(method_definition
  name: (property_identifier) @name) @definition.method

; Interfaces (TypeScript specific)
(interface_declaration
  name: (type_identifier) @name) @definition.interface

; Type aliases (TypeScript specific)
(type_alias_declaration
  name: (type_identifier) @name) @definition.type

; Enum declarations
(enum_declaration
  name: (identifier) @name) @definition.type

; Module/namespace
(module
  name: (identifier) @name) @definition.module

(internal_module
  name: (identifier) @name) @definition.module

; Export statements (for tracking exports)
(export_statement
  declaration: (function_declaration
    name: (identifier) @name)) @definition.function

(export_statement
  declaration: (class_declaration
    name: (type_identifier) @name)) @definition.class

(export_statement
  declaration: (interface_declaration
    name: (type_identifier) @name)) @definition.interface

(export_statement
  declaration: (type_alias_declaration
    name: (type_identifier) @name)) @definition.type

