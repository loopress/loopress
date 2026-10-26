<?php

declare(strict_types=1);

use Rector\CodingStyle\Rector\ArrowFunction\ArrowFunctionDelegatingCallToFirstClassCallableRector;
use Rector\CodingStyle\Rector\FuncCall\FunctionFirstClassCallableRector;
use Rector\CodeQuality\Rector\Catch_\ThrowWithPreviousExceptionRector;
use Rector\CodeQuality\Rector\Identical\FlipTypeControlToUseExclusiveTypeRector;
use Rector\Config\RectorConfig;
use Rector\DeadCode\Rector\Cast\RecastingRemovalRector;
use Rector\DeadCode\Rector\Concat\RemoveConcatAutocastRector;
use Rector\DeadCode\Rector\ClassMethod\RemoveUnusedPublicMethodParameterRector;
use Rector\DeadCode\Rector\MethodCall\RemoveNullArgOnNullDefaultParamRector;
use Rector\Php53\Rector\Ternary\TernaryToElvisRector;
use Rector\Php80\Rector\Class_\ClassPropertyAssignToConstructorPromotionRector;
use Rector\Php81\Rector\Array_\ArrayToFirstClassCallableRector;
use Rector\TypeDeclaration\Rector\ClassMethod\NarrowObjectReturnTypeRector;
use Rector\TypeDeclaration\Rector\FuncCall\AddArrowFunctionParamArrayWhereDimFetchRector;
use Rector\TypeDeclaration\Rector\StmtsAwareInterface\DeclareStrictTypesRector;

return RectorConfig::configure()
    ->withPaths([
        __DIR__ . '/src',
        __DIR__ . '/tests',
    ])
    ->withPhpSets(php82: true)
    ->withPreparedSets(typeDeclarations: true, deadCode: true, codeQuality: true)
    ->withRules([
        DeclareStrictTypesRector::class,
        ClassPropertyAssignToConstructorPromotionRector::class,
    ])
    ->withSkip([
        // `[$this, 'method']` stays an array callable: WordPress compares hook callbacks by
        // identity, and every `$this->method(...)` is a new Closure, so remove_action() and
        // has_action() could no longer find a callback registered that way.
        ArrayToFirstClassCallableRector::class,
        FunctionFirstClassCallableRector::class,
        // `fn ($v) => f($v)` caps the arguments at one; `f(...)` forwards every argument
        // WordPress passes (validate_callback gets three), which a built-in function rejects.
        ArrowFunctionDelegatingCallToFirstClassCallableRector::class,
        // phpcs.xml.dist (Universal.Operators.DisallowShortTernary) rejects `?:`.
        TernaryToElvisRector::class,
        // Adds `array` to arrow function params read with `$x['key']`; on an array_filter()
        // result Psalm infers that param as `never` and rejects the hint (ReservedWord).
        AddArrowFunctionParamArrayWhereDimFetchRector::class,
        // Public methods here are mostly WordPress callbacks (hooks, REST routes, stream
        // wrappers): their parameters are the caller's contract, used or not.
        RemoveUnusedPublicMethodParameterRector::class,
        // `$x !== null` already reads as intended; `instanceof \Fully\Qualified` adds noise.
        FlipTypeControlToUseExclusiveTypeRector::class,
        // Passes `$e->getCode()` to the new exception, but a Throwable's code can be a
        // string (PDOException), which RuntimeException's int $code rejects with a TypeError.
        ThrowWithPreviousExceptionRector::class,
        // `justReturn(null)` in Brain Monkey says what the stub returns; `justReturn()` hides it.
        RemoveNullArgOnNullDefaultParamRector::class,
        // Trust the WordPress stubs' types, which aren't always true at runtime: numeric array
        // keys arrive as int, DB strings are typed as int, wp_json_encode() can return false.
        // Same reason phpstan.neon keeps strict-rules' uselessCast off.
        RecastingRemovalRector::class,
        RemoveConcatAutocastRector::class,
        // Psalm types an `(object)` array cast as `object`, so a `\stdClass` return type fails
        // MoreSpecificReturnType there.
        NarrowObjectReturnTypeRector::class => [__DIR__ . '/src/Menu/RestApi/MenuController.php'],
        // Fixtures are read through reflection (attributes, verb methods): an "unused" or
        // empty method there is the whole point of the fixture.
        __DIR__ . '/tests/Unit/*/RestApi/*Fixture*.php',
    ]);
