<?php

declare(strict_types=1);

namespace Loopress\Tests\Contract;

use JsonSchema\Validator;
use PHPUnit\Framework\Assert;

/**
 * Fast, no-Docker complement to the CLI<->plugin e2e suite (see e2e/README.md): validates a
 * REST controller's response body against a documented JSON schema, so a renamed field or
 * changed type in a response fails here in seconds instead of only surfacing at the end of
 * the full e2e pipeline.
 */
trait AssertsJsonSchema
{
    private function assertMatchesSchema(string $schemaFile, mixed $data): void
    {
        $schemaPath = realpath(__DIR__ . '/schemas/' . $schemaFile);

        // The validator distinguishes JSON objects from arrays by PHP type (stdClass vs.
        // list), which associative arrays don't preserve; round-tripping through JSON
        // converts them the same way WP_REST_Response's own JSON encoding would.
        $decoded = json_decode((string) json_encode($data)); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode

        $validator = new Validator();
        // Passed as a file:// $ref rather than a pre-decoded object: schemas that $ref a
        // sibling file (e.g. a list schema referencing its item schema) need their own
        // location as the base URI to resolve that against, which only holds if the
        // library loads the file itself instead of receiving an already-decoded object.
        $validator->validate($decoded, (object) ['$ref' => 'file://' . $schemaPath]);

        Assert::assertTrue(
            $validator->isValid(),
            "Response does not match {$schemaFile}:\n" . implode("\n", array_map(
                static fn(array $error): string => "- [{$error['property']}] {$error['message']}",
                $validator->getErrors(),
            )),
        );
    }
}
