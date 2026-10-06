<?php

declare(strict_types=1);

use Rector\CodingStyle\Rector\ArrowFunction\ArrowFunctionDelegatingCallToFirstClassCallableRector;
use Rector\CodingStyle\Rector\FuncCall\FunctionFirstClassCallableRector;
use Rector\Config\RectorConfig;
use Rector\Php53\Rector\Ternary\TernaryToElvisRector;
use Rector\Php80\Rector\Class_\ClassPropertyAssignToConstructorPromotionRector;
use Rector\Php81\Rector\Array_\ArrayToFirstClassCallableRector;
use Rector\TypeDeclaration\Rector\FuncCall\AddArrowFunctionParamArrayWhereDimFetchRector;
use Rector\TypeDeclaration\Rector\StmtsAwareInterface\DeclareStrictTypesRector;

return RectorConfig::configure()
    ->withPaths([
        __DIR__ . '/src',
        __DIR__ . '/tests',
    ])
    ->withPhpSets(php82: true)
    ->withPreparedSets(typeDeclarations: true)
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
    ]);
