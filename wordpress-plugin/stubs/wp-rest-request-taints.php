<?php

// Taint annotations for `composer run psalm:taint` (see psalm.xml <stubs>), never loaded at
// runtime. Psalm only knows superglobals as taint sources and PHP builtins as sinks, but this
// plugin's input arrives through the REST API and its SQL goes through $wpdb, so the methods
// below are redeclared with their WordPress stub docblocks unchanged plus a taint tag: Psalm
// replaces a stubbed method's whole signature, so dropping the original types would loosen
// regular analysis too.
//
// Generated from vendor/php-stubs/wordpress-stubs (@phpstan-* tags dropped: Psalm ignores them
// there but would read them here); regenerate on a wordpress-stubs upgrade.

class WP_REST_Request implements \ArrayAccess
{
    /**
     * Retrieves a parameter from the request.
     *
     * @since 4.4.0
     *
     * @param string $key Parameter name.
     * @return mixed|null Value if set, null otherwise.
     * @psalm-taint-source input
     */
    public function get_param($key) {}

    /**
     * Retrieves merged parameters from the request.
     *
     * The equivalent of get_param(), but returns all parameters for the request.
     * Handles merging all the available values into a single array.
     *
     * @since 4.4.0
     *
     * @return array Map of key to value.
     * @psalm-taint-source input
     */
    public function get_params() {}

    /**
     * Retrieves parameters from the route itself.
     *
     * These are parsed from the URL using the regex.
     *
     * @since 4.4.0
     *
     * @return array Parameter map of key to value.
     * @psalm-taint-source input
     */
    public function get_url_params() {}

    /**
     * Retrieves parameters from the query string.
     *
     * These are the parameters you'd typically find in `$_GET`.
     *
     * @since 4.4.0
     *
     * @return array Parameter map of key to value.
     * @psalm-taint-source input
     */
    public function get_query_params() {}

    /**
     * Retrieves parameters from the body.
     *
     * These are the parameters you'd typically find in `$_POST`.
     *
     * @since 4.4.0
     *
     * @return array Parameter map of key to value.
     * @psalm-taint-source input
     */
    public function get_body_params() {}

    /**
     * Retrieves multipart file parameters from the body.
     *
     * These are the parameters you'd typically find in `$_FILES`.
     *
     * @since 4.4.0
     *
     * @return array Parameter map of key to value.
     *
     * @psalm-taint-source input
     */
    public function get_file_params() {}

    /**
     * Retrieves the parameters from a JSON-formatted body.
     *
     * @since 4.4.0
     *
     * @return array Parameter map of key to value.
     * @psalm-taint-source input
     */
    public function get_json_params() {}

    /**
     * Retrieves the request body content.
     *
     * @since 4.4.0
     *
     * @return string Binary data from the request body.
     * @psalm-taint-source input
     */
    public function get_body() {}

    /**
     * Retrieves the given header from the request.
     *
     * If the header has multiple values, they will be concatenated with a comma
     * as per the HTTP specification. Be aware that some non-compliant headers
     * (notably cookie headers) cannot be joined this way.
     *
     * @since 4.4.0
     *
     * @param string $key Header name, will be canonicalized to lowercase.
     * @return string|null String value if set, null otherwise.
     * @psalm-taint-source input
     */
    public function get_header($key) {}

    /**
     * Retrieves header values from the request.
     *
     * @since 4.4.0
     *
     * @param string $key Header name, will be canonicalized to lowercase.
     * @return array|null List of string values if set, null otherwise.
     * @psalm-taint-source input
     */
    public function get_header_as_array($key) {}

    /**
     * Retrieves all headers from the request.
     *
     * @since 4.4.0
     *
     * @return array Map of key to value. Key is always lowercase, as per HTTP specification.
     * @psalm-taint-source input
     */
    public function get_headers() {}

    /**
     * Retrieves the Content-Type of the request.
     *
     * @since 4.4.0
     *
     * @return array|null Map containing 'value' and 'parameters' keys
     *                    or null when no valid Content-Type header was
     *                    available.
     * @psalm-taint-source input
     */
    public function get_content_type() {}

    /**
     * Retrieves the route that matched the request.
     *
     * @since 4.4.0
     *
     * @return string Route matching regex.
     * @psalm-taint-source input
     */
    public function get_route() {}

    /**
     * Retrieves a parameter from the request.
     *
     * @since 4.4.0
     *
     * @param string $offset Parameter name.
     * @return mixed|null Value if set, null otherwise.
     * @psalm-taint-source input
     */
    #[\ReturnTypeWillChange]
    public function offsetGet($offset) {}
}

class wpdb
{
    /**
     * Prepares a SQL query for safe execution.
     *
     * Uses `sprintf()`-like syntax. The following placeholders can be used in the query string:
     *
     * - `%d` (integer)
     * - `%f` (float)
     * - `%s` (string)
     * - `%i` (identifier, e.g. table/field names)
     *
     * All placeholders MUST be left unquoted in the query string. A corresponding argument
     * MUST be passed for each placeholder.
     *
     * Note: There is one exception to the above: for compatibility with old behavior,
     * numbered or formatted string placeholders (eg, `%1$s`, `%5s`) will not have quotes
     * added by this function, so should be passed with appropriate quotes around them.
     *
     * Literal percentage signs (`%`) in the query string must be written as `%%`. Percentage wildcards
     * (for example, to use in LIKE syntax) must be passed via a substitution argument containing
     * the complete LIKE string, these cannot be inserted directly in the query string.
     * Also see wpdb::esc_like().
     *
     * Arguments may be passed as individual arguments to the method, or as a single array
     * containing all arguments. A combination of the two is not supported.
     *
     * Examples:
     *
     *     $wpdb->prepare(
     *         "SELECT * FROM `table` WHERE `column` = %s AND `field` = %d OR `other_field` LIKE %s",
     *         array( 'foo', 1337, '%bar' )
     *     );
     *
     *     $wpdb->prepare(
     *         "SELECT DATE_FORMAT(`field`, '%%c') FROM `table` WHERE `column` = %s",
     *         'foo'
     *     );
     *
     *     $wpdb->prepare(
     *         "SELECT * FROM %i WHERE %i = %s",
     *         $table,
     *         $field,
     *         $value
     *     );
     *
     * @since 2.3.0
     * @since 5.3.0 Formalized the existing and already documented `...$args` parameter
     *              by updating the function signature. The second parameter was changed
     *              from `$args` to `...$args`.
     * @since 6.2.0 Added `%i` for identifiers, e.g. table or field names.
     *              Check support via `wpdb::has_cap( 'identifier_placeholders' )`.
     *              This preserves compatibility with `sprintf()`, as the C version uses
     *              `%d` and `$i` as a signed integer, whereas PHP only supports `%d`.
     *
     * @link https://www.php.net/sprintf Description of syntax.
     *
     * @param string      $query   Query statement with `sprintf()`-like placeholders.
     * @param array|mixed $args    The array of variables to substitute into the query's placeholders
     *                             if being called with an array of arguments, or the first variable
     *                             to substitute into the query's placeholders if being called with
     *                             individual arguments.
     * @param mixed       ...$args Further variables to substitute into the query's placeholders
     *                             if being called with individual arguments.
     * @return string|null Sanitized query string, if there is a query to prepare.
     * @psalm-taint-sink sql $query
     * @psalm-taint-escape sql
     */
    public function prepare($query, ...$args) {}

    /**
     * Performs a database query, using current database connection.
     *
     * More information can be found on the documentation page.
     *
     * @since 0.71
     *
     * @link https://developer.wordpress.org/reference/classes/wpdb/
     *
     * @param string $query Database query.
     * @return int|bool Boolean true for CREATE, ALTER, TRUNCATE and DROP queries. Number of rows
     *                  affected/selected for all other queries. Boolean false on error.
     * @psalm-taint-sink sql $query
     */
    public function query($query) {}

    /**
     * Retrieves one value from the database.
     *
     * Executes a SQL query and returns the value from the SQL result.
     * If the SQL result contains more than one column and/or more than one row,
     * the value in the column and row specified is returned. If $query is null,
     * the value in the specified column and row from the previous SQL result is returned.
     *
     * Returns null both on failure and when the matched cell value is an empty
     * string. To distinguish the two cases, check {@see self::$last_error}.
     *
     * @since 0.71
     *
     * @param string|null $query Optional. SQL query. Defaults to null, use the result from the previous query.
     * @param int         $x     Optional. Column of value to return. Indexed from 0. Default 0.
     * @param int         $y     Optional. Row of value to return. Indexed from 0. Default 0.
     * @return string|null Database query result (as string), or null on failure or when the value is an empty string.
     * @psalm-taint-sink sql $query
     */
    public function get_var($query = \null, $x = 0, $y = 0) {}

    /**
     * Retrieves one row from the database.
     *
     * Executes a SQL query and returns the row from the SQL result.
     *
     * @since 0.71
     *
     * @param string|null $query  SQL query.
     * @param string      $output Optional. The required return type. One of OBJECT, ARRAY_A, or ARRAY_N, which
     *                            correspond to an stdClass object, an associative array, or a numeric array,
     *                            respectively. Default OBJECT.
     * @param int         $y      Optional. Row to return. Indexed from 0. Default 0.
     * @return array|object|null Database query result in format specified by $output or null on failure.
     * @psalm-taint-sink sql $query
     */
    public function get_row($query = \null, $output = \OBJECT, $y = 0) {}

    /**
     * Retrieves one column from the database.
     *
     * Executes a SQL query and returns the column from the SQL result.
     * If the SQL result contains more than one column, the column specified is returned.
     * If $query is null, the specified column from the previous SQL result is returned.
     *
     * @since 0.71
     *
     * @param string|null $query Optional. SQL query. Defaults to previous query.
     * @param int         $x     Optional. Column to return. Indexed from 0. Default 0.
     * @return array Database query result. Array indexed from 0 by SQL result row number.
     * @psalm-taint-sink sql $query
     */
    public function get_col($query = \null, $x = 0) {}

    /**
     * Retrieves an entire SQL result set from the database (i.e., many rows).
     *
     * Executes a SQL query and returns the entire SQL result.
     *
     * Returns an empty array when no rows match or when the database
     * reports an error for the query. Returns null when $query is empty,
     * when $output is not one of the recognized constants, or when the
     * query cannot run because the connection is not ready.
     *
     * @since 0.71
     *
     * @param string|null $query  SQL query.
     * @param string      $output Optional. Any of ARRAY_A | ARRAY_N | OBJECT | OBJECT_K constants.
     *                            With one of the first three, return an array of rows indexed
     *                            from 0 by SQL result row number. Each row is an associative array
     *                            (column => value, ...), a numerically indexed array (0 => value, ...),
     *                            or an object ( ->column = value ), respectively. With OBJECT_K,
     *                            return an associative array of row objects keyed by the value
     *                            of each row's first column's value. Duplicate keys are discarded.
     *                            Default OBJECT.
     * @return array|null Database query results. Empty array when no rows match
     *                    or on database error. Null when $query is empty, when
     *                    $output is invalid, or when the connection is not ready.
     * @psalm-taint-sink sql $query
     */
    public function get_results($query = \null, $output = \OBJECT) {}
}
