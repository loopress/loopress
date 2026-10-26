import {Help} from '@oclif/core'

const BANNER = `          
                        
      @@@@@@@@@@@*      
     @@@@@@@@@@@*++     
    @@@@        ++++    
   @@@@          ++++     ▗▖    ▗▄▖  ▗▄▖ ▗▄▄▖ ▗▄▄▖ ▗▄▄▄▖ ▗▄▄▖ ▗▄▄▖
  @@@@            ++++    ▐▌   ▐▌ ▐▌▐▌ ▐▌▐▌ ▐▌▐▌ ▐▌▐▌   ▐▌   ▐▌   
 @@@@              ++++   ▐▌   ▐▌ ▐▌▐▌ ▐▌▐▛▀▘ ▐▛▀▚▖▐▛▀▀▘ ▝▀▚▖ ▝▀▚▖
  @@@@            ++++    ▐▙▄▄▖▝▚▄▞▘▝▚▄▞▘▐▌   ▐▌ ▐▌▐▙▄▄▖▗▄▄▞▘▗▄▄▞▘  (ALPHA)
   @@@@          ++++   
    @@@@        ++++    
     @@@@@@@@@@@*++     
      @@@@@@@@@@@*      
                            
`

export default class CustomHelp extends Help {
  override async showRootHelp(): Promise<void> {
    this.log(BANNER)
    await super.showRootHelp()
  }
}
