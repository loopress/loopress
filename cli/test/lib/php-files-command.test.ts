import {describe, expect, it} from 'vitest'

import {API_FILES_RESOURCE, phpFileProblems} from '../../src/lib/php-files-command.js'

describe('phpFileProblems', () => {
  it('accepts a declaration-only file', () => {
    expect(phpFileProblems(API_FILES_RESOURCE, 'hello', '<?php\ndeclare(strict_types=1);\nfinal class Hello {}\n')).toEqual([])
  })

  it('requires declare(strict_types=1) to be the first statement', () => {
    expect(phpFileProblems(API_FILES_RESOURCE, 'hello', '<?php\nnamespace App;\ndeclare(strict_types=1);\nfinal class Hello {}\n')).toEqual([
      'hello.php: "declare(strict_types=1);" must be the first statement, right after <?php (one in a comment doesn\'t count)',
    ])
  })

  it('explains code outside the class', () => {
    expect(phpFileProblems(API_FILES_RESOURCE, 'hello', "<?php\ndeclare(strict_types=1);\ndefined('ABSPATH') || exit;\nfinal class Hello {}\n")).toEqual([
      "hello.php: code outside the class (defined) would run at load time, move it into the class. Don't add an ABSPATH guard: the plugin adds one on push.",
    ])
  })
})
