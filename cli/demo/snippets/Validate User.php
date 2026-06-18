/**
 * Plugin Name: NestJS WP Auth
 * Description: Endpoint interne pour valider les credentials WordPress depuis NestJS.
 * Version:     1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'init', function () {

    $request_uri = parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH );

    if ( $request_uri !== '/wp-json/validate-user' ) {
        return;
    }

    if ( $_SERVER['REQUEST_METHOD'] !== 'POST' ) {
        http_response_code( 405 );
        header( 'Content-Type: application/json' );
        echo json_encode( [ 'error' => 'Method not allowed' ] );
        exit;
    }

    $body = file_get_contents( 'php://input' );
    $data = json_decode( $body, true );

    if ( ! isset( $data['username'], $data['password'] ) ) {
        http_response_code( 400 );
        header( 'Content-Type: application/json' );
        echo json_encode( [ 'error' => 'username and password are required' ] );
        exit;
    }

    $user  = wp_authenticate( sanitize_user( $data['username'] ), $data['password'] );
    $valid = ! is_wp_error( $user );

	http_response_code( $valid ? 200 : 401 );
	header( 'Content-Type: application/json' );
	echo json_encode( $valid
		? [ 'valid' => true, 'userId' => $user->ID ]
		: [ 'valid' => false ]
	);
	exit;

} );