import Carnival from '../../public/colorlogos/carnival-cruises-logo.gif'
import Celebrity from '../../public/colorlogos/celebrity-cruises-logo.gif'
import Costa from '../../public/colorlogos/costa-cruise-logo.gif'
import Virgin from '../../public/colorlogos/Virgin_logo.gif'


import Cunard from '../../public/colorlogos/cunard-logo.gif'
import Disney from '../../public/colorlogos/disney-cruises-logo.gif'
import Holland from '../../public/colorlogos/holland-american-line-logo.gif'
import MSC from '../../public/colorlogos/msc-cruises-logo.gif'
import Norwegian from '../../public/colorlogos/norwegian-cruise-line-logo.gif'
import Oceania from '../../public/colorlogos/oceania-cruises.gif'
import Princess from '../../public/colorlogos/princess-cruises.gif'

import Royal from '../../public/colorlogos/royal-caribbean-international-logo.gif'
import Default from '../../public/colorlogos/default_ship.png'



const logoNamesUpper = [
    'CARNIVAL',
    'CELEBRITY',
    'COSTA',
    'VIRGIN',
    'CUNARD',
    'DISNEY',
    'HOLLAND',
    'MSC',
    'NORWEGIAN',
    'OCEANIA',
    'PRINCESS',
    'ROYAL',

]
export const shipLogos = (finderText:string) => {
    for (let i = 0; i < logoNamesUpper.length; i++) {
        if (finderText.toUpperCase().includes(logoNamesUpper[i])) {
            switch (i) {
                case 0:
                    return Carnival
                case 1:
                    return Celebrity
                case 2:
                    return Costa
                case 3:
                    return Virgin
                case 4:
                    return Cunard
                case 5:
                    return Disney
                case 6:
                    return Holland
                case 7:
                    return MSC
                case 8:
                    return Norwegian
                case 9:
                    return Oceania
                case 10:
                    return Princess
                case 11:
                    return Royal
                default:
                    return Default
            }
        }
    }
    return Default;
}
