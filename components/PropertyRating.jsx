//import { Grid, Icon, Label } from "semantic-ui-react";
import { StarIcon, StarHalfIcon } from "lucide-react";

const PropertyRating = ({
  rating,color = 'text-primary',
  showNumber = true,className = '', ...props},
 
  
  ) => {
  
  const wholeNum = Math.floor(rating);
  const decimal = rating / wholeNum !== 1;
  //console.log(decimal);

  const __renderStars = () => {
    let result = [];
    for (let index = 0; index < wholeNum; index++) {
      result.push(<StarIcon key={index + "key"}  className={`w-4 ${color}`}></StarIcon>);
    }
    if (decimal) {
      result.push(<StarHalfIcon key="half-star" className={`w-4 ${color}`}></StarHalfIcon>);
    }

    return <div
    
    className={`flex flex-row text-sm ${className}`} >{result}</div>;
  };

  return (
    <div >
      
         {__renderStars()}
          {showNumber && <p>{rating} stars</p>}
       
    
      {/* <Grid.Row columns={2}>
        <Grid.Column textAlign="center" >
          <Label>{rating} stars</Label>
        </Grid.Column>
      
      </Grid.Row> */}
    </div>
  );
};

export default PropertyRating;
