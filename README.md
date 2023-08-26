# Setup Odin

A GitHub action to setup the [Odin](https://github.com/odin-lang/Odin) compiler.

## Usage

See [action.yml](https://github.com/laytan/setup-odin/blob/main/action.yml)

### Example

Installs the latest Odin commit on the master branch and adds it to PATH.

All options are optional.

```yaml
steps:
  - uses: laytan/setup-odin@v1
    # with:
    # odin-version: master
```
