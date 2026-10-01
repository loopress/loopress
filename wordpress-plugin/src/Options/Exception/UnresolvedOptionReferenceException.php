<?php

declare(strict_types=1);

namespace Loopress\Options\Exception;

// A post reference declared in an option file's `refs` that can't be resolved on this
// environment (see OptionReferences): the post is missing, or the file still holds a raw ID.
class UnresolvedOptionReferenceException extends \RuntimeException {}
